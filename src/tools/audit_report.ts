/**
 * Audit Report Tool
 * Provides MCP tool usage statistics and audit summaries
 */

import { getSessions } from '../sessions/store.js';
import { isKnownMember, getMember } from '../security/identity.js';
import type { DecisionRecord } from '../protocol/types.js';
import { performanceMonitor } from '../monitoring/performance.js';
import {
  readRejections,
  type RejectionRecord,
} from '../audit/rejection_log.js';

export interface ToolUsageStats {
  tool_name: string;
  total_calls: number;
  success_count: number;
  failure_count: number;
  avg_duration_ms: number;
  last_used: string;
}

export interface CallerStats {
  caller: string;
  total_commands: number;
  success_rate: number;
  tools_used: Record<string, number>;
  last_active: string;
}

export interface AuditSummary {
  generated_at: string;
  period: { from: string; to: string };
  total_sessions: number;
  total_commands: number;
  success_rate: number;
  tool_usage: ToolUsageStats[];
  caller_stats: CallerStats[];
  top_commands: { command: string; count: number }[];
  violations: { rule: string; count: number }[];
  rejections: {
    total: number;
    by_category: Record<string, number>;
    by_caller: Record<string, number>;
    recent: RejectionRecord[];
  };
}

async function collectDecisions(): Promise<DecisionRecord[]> {
  const sessions = await getSessions();
  const decisions: DecisionRecord[] = [];
  for (const session of sessions) {
    if (session.decision_log) {
      decisions.push(...session.decision_log);
    }
  }
  return decisions;
}

async function collectCommandHistory(): Promise<
  Array<{
    session_id: string;
    commands: string[];
  }>
> {
  const sessions = await getSessions();
  return sessions
    .filter((s) => s.command_history && s.command_history.length > 0)
    .map((s) => ({
      session_id: s.id,
      commands: s.command_history!,
    }));
}

function buildToolUsage(decisions: DecisionRecord[]): ToolUsageStats[] {
  const toolCounts: Record<
    string,
    {
      total: number;
      success: number;
      fail: number;
      durationSum: number;
      lastUsed: string;
    }
  > = {};

  for (const d of decisions) {
    const tool = inferToolFromCommand(d.command);
    if (!toolCounts[tool]) {
      toolCounts[tool] = {
        total: 0,
        success: 0,
        fail: 0,
        durationSum: 0,
        lastUsed: d.timestamp,
      };
    }
    const tc = toolCounts[tool];
    tc.total++;
    if (d.success) tc.success++;
    else tc.fail++;
    if (d.timestamp > tc.lastUsed) tc.lastUsed = d.timestamp;
  }

  return Object.entries(toolCounts)
    .map(([tool_name, tc]) => ({
      tool_name,
      total_calls: tc.total,
      success_count: tc.success,
      failure_count: tc.fail,
      avg_duration_ms: 0,
      last_used: tc.lastUsed,
    }))
    .sort((a, b) => b.total_calls - a.total_calls);
}

function inferToolFromCommand(command: string): string {
  const firstWord = command.trim().split(/\s+/)[0];
  if (
    ['cd', 'ls', 'pwd', 'cat', 'head', 'tail', 'grep', 'find'].includes(
      firstWord
    )
  )
    return 'execute_command (read)';
  if (['rm', 'mv', 'cp', 'mkdir', 'touch', 'chmod'].includes(firstWord))
    return 'execute_command (write)';
  if (['git'].includes(firstWord)) return 'execute_command (git)';
  if (['npm', 'node', 'npx', 'python', 'pip'].includes(firstWord))
    return 'execute_command (runtime)';
  return 'execute_command (other)';
}

function buildCallerStats(decisions: DecisionRecord[]): CallerStats[] {
  const callerMap: Record<
    string,
    {
      total: number;
      success: number;
      tools: Record<string, number>;
      lastActive: string;
    }
  > = {};

  for (const d of decisions) {
    const caller = d.source_trace?.[0]?.origin || 'unknown';
    if (!callerMap[caller]) {
      callerMap[caller] = {
        total: 0,
        success: 0,
        tools: {},
        lastActive: d.timestamp,
      };
    }
    const cm = callerMap[caller];
    cm.total++;
    if (d.success) cm.success++;
    const tool = inferToolFromCommand(d.command);
    cm.tools[tool] = (cm.tools[tool] || 0) + 1;
    if (d.timestamp > cm.lastActive) cm.lastActive = d.timestamp;
  }

  return Object.entries(callerMap)
    .map(([caller, cm]) => ({
      caller,
      total_commands: cm.total,
      success_rate:
        cm.total > 0 ? Math.round((cm.success / cm.total) * 10000) / 100 : 0,
      tools_used: cm.tools,
      last_active: cm.lastActive,
    }))
    .sort((a, b) => b.total_commands - a.total_commands);
}

function buildTopCommands(
  histories: Array<{ session_id: string; commands: string[] }>
): { command: string; count: number }[] {
  const cmdCount: Record<string, number> = {};
  for (const h of histories) {
    for (const cmd of h.commands) {
      const normalized = cmd.trim().split(/\s+/).slice(0, 3).join(' ');
      cmdCount[normalized] = (cmdCount[normalized] || 0) + 1;
    }
  }
  return Object.entries(cmdCount)
    .map(([command, count]) => ({ command, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

async function buildViolations(): Promise<{ rule: string; count: number }[]> {
  const sessions = await getSessions();
  const violationCount: Record<string, number> = {};
  for (const session of sessions) {
    if (session.behavioral_violations) {
      for (const v of session.behavioral_violations) {
        violationCount[v.rule] = (violationCount[v.rule] || 0) + 1;
      }
    }
  }
  return Object.entries(violationCount)
    .map(([rule, count]) => ({ rule, count }))
    .sort((a, b) => b.count - a.count);
}

function buildRejections(): {
  total: number;
  by_category: Record<string, number>;
  by_caller: Record<string, number>;
  recent: RejectionRecord[];
} {
  const records = readRejections(20);
  const by_category: Record<string, number> = {};
  const by_caller: Record<string, number> = {};
  for (const r of records) {
    by_category[r.category] = (by_category[r.category] || 0) + 1;
    by_caller[r.caller] = (by_caller[r.caller] || 0) + 1;
  }
  return {
    total: records.length,
    by_category,
    by_caller,
    recent: records.slice(-10),
  };
}

export const auditReport = {
  definition: {
    name: 'audit_report',
    description:
      'Generate MCP tool usage audit report. Returns statistics on command execution, caller identity, success rates, and behavioral violations across all sessions.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        format: {
          type: 'string',
          enum: ['summary', 'detailed', 'caller'],
          description:
            'Report format: summary (overview), detailed (full stats), caller (per-caller breakdown). Default: summary.',
        },
        caller: {
          type: 'string',
          description:
            'Filter by caller identity (e.g. "lingflow"). Only used when format=caller.',
        },
      },
    },
  },

  async handler(args: unknown) {
    const { format = 'summary', caller } = args as {
      format?: 'summary' | 'detailed' | 'caller';
      caller?: string;
    };

    if (caller && !isKnownMember(caller)) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Unknown caller: "${caller}" is not a registered 灵族 member`,
          },
        ],
        isError: true,
      };
    }

    const decisions = await collectDecisions();
    const histories = await collectCommandHistory();
    const sessions = await getSessions();

    const totalCommands = decisions.length;
    const successCount = decisions.filter((d) => d.success).length;

    const timestamps = decisions.map((d) => d.timestamp).sort();
    const period = {
      from: timestamps[0] || new Date().toISOString(),
      to: timestamps[timestamps.length - 1] || new Date().toISOString(),
    };

    if (format === 'caller' && caller) {
      const callerDecisions = decisions.filter(
        (d) => d.source_trace?.[0]?.origin === caller
      );
      const member = getMember(caller);
      const callerCmds = callerDecisions.length;
      const callerSuccess = callerDecisions.filter((d) => d.success).length;

      const report = {
        caller,
        role: member?.role || 'unknown',
        generated_at: new Date().toISOString(),
        total_commands: callerCmds,
        success_rate:
          callerCmds > 0
            ? Math.round((callerSuccess / callerCmds) * 10000) / 100
            : 0,
        recent_commands: callerDecisions.slice(-10).map((d) => ({
          command: d.command,
          success: d.success,
          timestamp: d.timestamp,
          reasoning: d.reasoning || undefined,
        })),
        command_categories: buildToolUsage(callerDecisions),
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(report, null, 2),
          },
        ],
      };
    }

    const summary: AuditSummary = {
      generated_at: new Date().toISOString(),
      period,
      total_sessions: sessions.length,
      total_commands: totalCommands,
      success_rate:
        totalCommands > 0
          ? Math.round((successCount / totalCommands) * 10000) / 100
          : 0,
      tool_usage: buildToolUsage(decisions),
      caller_stats: buildCallerStats(decisions),
      top_commands: buildTopCommands(histories),
      violations: await buildViolations(),
      rejections: buildRejections(),
    };

    if (format === 'detailed') {
      const perfMetrics = performanceMonitor.getMetrics();
      const perfHistory = performanceMonitor.getExecutionHistory(20);
      const detailedRejections = readRejections(50);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                ...summary,
                rejections: {
                  ...summary.rejections,
                  recent: detailedRejections,
                },
                performance: {
                  metrics: perfMetrics,
                  recent_executions: perfHistory,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(summary, null, 2),
        },
      ],
    };
  },
};
