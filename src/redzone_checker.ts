/**
 * RedZone Checker — Pure Function for Security Decision
 *
 * Provides a unified check() function for external callers (gateway/LingBus)
 * to evaluate whether an operation is allowed, blocked, or requires review.
 *
 * This is the core of议题6 #4: redzone→LingBus hook (最小化scope).
 */

import { securityValidator } from './security/validator.js';
import { authorize } from './tools/authorize.js';

export type CheckDecision = 'allow' | 'block' | 'pending_review';

export interface CheckContext {
  caller: string;
  operation: string;
  timestamp?: string;
  meeting_id?: string;
  agent_id?: string;
  target_agent?: string;
  reason?: string;
  [key: string]: unknown;
}

export interface CheckResult {
  decision: CheckDecision;
  rule_id?: string;
  reason: string;
  authorization_id?: string; // 当 decision=pending_review 时返回
  score?: number; // 可选：风险评分（灵犀内部评估）
  category?: string; // 命令分类（如果适用）
}

/**
 * Pattern rule definition for redzone operations
 */
interface PatternRule {
  id: string;
  pattern: string | RegExp;
  decision: CheckDecision;
  risk_level: 'critical' | 'high' | 'medium' | 'low';
  reason: string;
  requires_auth?: boolean;
  requires_audit?: boolean;
}

/**
 * Redzone pattern rules (规范化后的rejection_log pattern清单)
 */
const REDZONE_PATTERNS: PatternRule[] = [
  // P0: Blacklist (critical)
  {
    id: 'P0-001',
    pattern: /^rm\s+-rf\s+\.\*/,
    decision: 'block',
    risk_level: 'critical',
    reason: '破坏性命令：递归删除根目录',
  },
  {
    id: 'P0-002',
    pattern: /^dd\s+.*\s+of=\/dev\/.*/,
    decision: 'block',
    risk_level: 'critical',
    reason: '破坏性命令：覆盖设备块',
  },
  {
    id: 'P0-003',
    pattern: /^(mkfs|format)\s+.*/,
    decision: 'block',
    risk_level: 'critical',
    reason: '破坏性命令：格式化文件系统',
  },

  // P1: High-risk operations (pending_review)
  {
    id: 'P1-001',
    pattern: 'produce_episodes',
    decision: 'pending_review',
    risk_level: 'high',
    reason: '高风险操作：生产episodes影响数据集',
    requires_auth: true,
  },
  {
    id: 'P1-002',
    pattern: 'optimize_parameters',
    decision: 'pending_review',
    risk_level: 'high',
    reason: '高风险操作：参数优化影响模型性能',
    requires_auth: true,
  },
  {
    id: 'P1-002a',
    pattern: 'meta_optimize',
    decision: 'pending_review',
    risk_level: 'high',
    reason: '高风险操作：元优化修改生产参数',
    requires_auth: true,
  },
  {
    id: 'P1-002b',
    pattern: 'modify_production_params',
    decision: 'pending_review',
    risk_level: 'high',
    reason: '高风险操作：修改生产环境参数',
    requires_auth: true,
  },
  {
    id: 'P1-002c',
    pattern: 'overwrite_baseline',
    decision: 'pending_review',
    risk_level: 'high',
    reason: '高风险操作：覆盖基线模型',
    requires_auth: true,
  },
  {
    id: 'P1-002d',
    pattern: 'model_finetune',
    decision: 'pending_review',
    risk_level: 'high',
    reason: '高风险操作：模型微调影响推理质量',
    requires_auth: true,
  },
  {
    id: 'P1-003',
    pattern: 'delete_records',
    decision: 'pending_review',
    risk_level: 'high',
    reason: '高风险操作：删除记录不可恢复',
    requires_auth: true,
  },

  // P2: Medium-risk operations (allow + audit)
  {
    id: 'P2-001',
    pattern: 'query_records',
    decision: 'allow',
    risk_level: 'medium',
    reason: '中风险操作：只读查询，需审计',
    requires_audit: true,
  },
  {
    id: 'P2-002',
    pattern: 'list_sessions',
    decision: 'allow',
    risk_level: 'medium',
    reason: '中风险操作：列出会话信息，需审计',
    requires_audit: true,
  },
  {
    id: 'P2-003',
    pattern: 'export_logs',
    decision: 'allow',
    risk_level: 'medium',
    reason: '中风险操作：导出日志，需审计',
    requires_audit: true,
  },

  // P3: Low-risk operations (allow)
  {
    id: 'P3-001',
    pattern: 'health_check',
    decision: 'allow',
    risk_level: 'low',
    reason: '低风险操作：健康检查',
  },
  {
    id: 'P3-002',
    pattern: 'version',
    decision: 'allow',
    risk_level: 'low',
    reason: '低风险操作：版本查询',
  },
  {
    id: 'P3-003',
    pattern: 'status',
    decision: 'allow',
    risk_level: 'low',
    reason: '低风险操作：状态查询',
  },
];

/**
 * Find matching rule for the given operation
 */
function findMatchingRule(operation: string): PatternRule | undefined {
  for (const rule of REDZONE_PATTERNS) {
    if (typeof rule.pattern === 'string') {
      if (operation.includes(rule.pattern)) {
        return rule;
      }
    } else if (rule.pattern instanceof RegExp) {
      if (rule.pattern.test(operation)) {
        return rule;
      }
    }
  }
  return undefined;
}

/**
 * Check if an operation is allowed, blocked, or requires review
 *
 * @param operation - Operation string (e.g., "produce_episodes", "rm -rf /tmp")
 * @param context - Context information (caller, meeting_id, etc.)
 * @returns CheckResult with decision and reason
 */
export async function check(
  operation: string,
  context: CheckContext
): Promise<CheckResult> {
  const { caller, timestamp = new Date().toISOString() } = context;

  // 1. Check against redzone patterns
  const rule = findMatchingRule(operation);
  if (rule) {
    if (rule.decision === 'block') {
      return {
        decision: 'block',
        rule_id: rule.id,
        reason: rule.reason,
        category: 'redzone',
      };
    }

    if (rule.decision === 'pending_review') {
      // 2. For pending_review, create an authorization request
      const authResult = await authorize.handler({
        command: 'require',
        caller,
        operation: `${context.operation} (${rule.reason})`,
        details: {
          rule_id: rule.id,
          risk_level: rule.risk_level,
          meeting_id: context.meeting_id,
          agent_id: context.agent_id,
          timestamp,
        },
      });

      const authData = JSON.parse(
        (authResult.content as Array<{ text: string }>)[0].text
      );

      return {
        decision: 'pending_review',
        rule_id: rule.id,
        reason: rule.reason,
        authorization_id: authData.authorization_id,
        score: 0.8, // 高风险操作默认评分
        category: 'redzone',
      };
    }

    if (rule.decision === 'allow') {
      return {
        decision: 'allow',
        rule_id: rule.id,
        reason: rule.reason,
        category: 'redzone',
      };
    }
  }

  // 3. Check if it's a terminal command (通过securityValidator)
  if (operation.startsWith('execute_command:')) {
    const cmd = operation.replace('execute_command:', '');
    const category = securityValidator.categorize(cmd);

    if (category === 'blacklisted') {
      return {
        decision: 'block',
        rule_id: 'BLACKLIST-DEFAULT',
        reason: `命令 '${cmd.split(' ')[0]}' 在黑名单中`,
        category,
      };
    }

    if (category === 'red_zone') {
      // 创建授权请求
      const authResult = await authorize.handler({
        command: 'require',
        caller,
        operation: `执行红区命令: ${cmd}`,
        details: {
          command: cmd,
          timestamp,
        },
      });

      const authData = JSON.parse(
        (authResult.content as Array<{ text: string }>)[0].text
      );

      return {
        decision: 'pending_review',
        rule_id: 'REDZONE-DEFAULT',
        reason: `命令 '${cmd.split(' ')[0]}' 属于红区操作，需审批`,
        authorization_id: authData.authorization_id,
        score: 0.7,
        category,
      };
    }

    if (category === 'authorizable') {
      return {
        decision: 'allow',
        rule_id: 'AUTHORIZABLE-DEFAULT',
        reason: `命令 '${cmd.split(' ')[0]}' 可授权执行`,
        category,
      };
    }
  }

  // 4. Default: allow for unknown operations
  return {
    decision: 'allow',
    reason: '未知操作，默认允许',
  };
}

/**
 * Get all redzone patterns (for gateway configuration)
 */
export function getRedzonePatterns(): PatternRule[] {
  return REDZONE_PATTERNS;
}

/**
 * Get pattern rules by risk level
 */
export function getPatternsByRiskLevel(
  level: 'critical' | 'high' | 'medium' | 'low'
): PatternRule[] {
  return REDZONE_PATTERNS.filter((p) => p.risk_level === level);
}
