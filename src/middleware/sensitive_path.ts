/**
 * Sensitive Path Gate (P0.5)
 * Path-graded access control: 默认 Deny + 显式 allowed_paths 白名单。
 *
 * 规则（智桥 Round 2 确认）:
 *   1. 工作区内只读 (cat/head/grep/ls) → 放行
 *   2. 工作区内写 → 默认 Deny (需 allowed_paths 包含)
 *   3. 跨成员目录只读 → 必审批 (显式 allowed_cross_member_reads)
 *   4. 跨成员目录写 → 默认 Deny
 *   5. 敏感路径 (config/secrets/keys) 任何操作 → 必审批
 *
 * 决策语义 (智桥 Round 2):
 *   'proceed' - 放行
 *   'ask'     - 强制弹窗 (需 authorization_id)
 *   'deny'    - 阻断
 */

import * as path from 'path';
import * as fs from 'fs';
import type { Middleware } from '../pipeline/middleware.js';
import { logRejection } from '../audit/rejection_log.js';

export type SensitivePathOutcome = 'proceed' | 'ask' | 'deny';

const SENSITIVE_CONFIG_PATH = process.env['LING_TERM_CONFIG_DIR']
  ? path.join(process.env['LING_TERM_CONFIG_DIR'], 'sensitive_paths.json')
  : path.join(
      process.env['HOME'] || '/home/ai',
      '.ling-term-mcp',
      'sensitive_paths.json'
    );

export interface SensitivePathConfig {
  /** Allowed paths within caller's home (~/) — default empty = default Deny */
  allowed_paths: string[];
  /** Cross-member read whitelist (高风险, 默认空) */
  allowed_cross_member_reads: string[];
  /** Cross-member write whitelist (默认空) */
  allowed_cross_member_writes: string[];
  /** Strict sensitive paths (config/secrets/keys) — 任何操作必审批 */
  sensitive_markers: string[];
  /** All member home directories (default Deny for cross-member) */
  member_homes: string[];
}

const DEFAULT_CONFIG: SensitivePathConfig = {
  allowed_paths: [
    '/home/ai/lingxi/src/**',
    '/home/ai/lingxi/tests/**',
    '/home/ai/lingxi/docs/**',
    '/home/ai/lingxi/.lingxi/**',
    '/tmp/**',
    '/home/ai/.ling_lib/**',
    '/home',
  ],
  allowed_cross_member_reads: [],
  allowed_cross_member_writes: [],
  sensitive_markers: [
    '.env',
    'security_registry.yaml',
    '.ling_keys',
    'api_keys',
    'secrets',
    '.git/config',
  ],
  member_homes: [
    '/home/ai/lingflow',
    '/home/ai/lingxi',
    '/home/ai/lingzhi',
    '/home/ai/lingcreate',
    '/home/ai/lingyang',
    '/home/ai/lingminopt',
    '/home/ai/lingresearch',
    '/home/ai/lingtongask',
    '/home/ai/lingflow_plus',
    '/home/ai/lingmessage',
    '/home/ai/lingan',
    '/home/ai/zhibridge',
    '/home/ai/atomcode',
    '/home/ai/lingclaude',
  ],
};

let cachedConfig: SensitivePathConfig | null = null;

export function loadSensitivePathConfig(): SensitivePathConfig {
  if (cachedConfig) return cachedConfig;
  try {
    if (fs.existsSync(SENSITIVE_CONFIG_PATH)) {
      const data = fs.readFileSync(SENSITIVE_CONFIG_PATH, 'utf8');
      const loaded = JSON.parse(data) as Partial<SensitivePathConfig>;
      cachedConfig = { ...DEFAULT_CONFIG, ...loaded };
      return cachedConfig;
    }
  } catch {
    // ignore
  }
  cachedConfig = { ...DEFAULT_CONFIG };
  return cachedConfig;
}

export function resetSensitivePathConfig(): void {
  cachedConfig = null;
}

const READ_ONLY_TOOLS = new Set([
  'cat',
  'head',
  'tail',
  'less',
  'more',
  'grep',
  'egrep',
  'fgrep',
  'find',
  'ls',
  'stat',
  'file',
  'wc',
  'diff',
  'tree',
  'awk',
  'sed',
  'sort',
  'uniq',
  'cut',
  'tr',
  'xxd',
  'od',
]);

const WRITE_TOOLS = new Set([
  'rm',
  'rmdir',
  'mv',
  'cp',
  'ln',
  'mkdir',
  'rmkdir',
  'touch',
  'chmod',
  'chown',
  'chgrp',
  'tee',
  '>',
  '>>',
  'dd',
  'shred',
]);

function getCommandName(command: string): string {
  const trimmed = command.trim();
  // For `cd /path && rm foo` we only look at the first command
  const firstSegment = trimmed.split(/\s*(?:&&|\|\||;|\|)\s*/, 1)[0] || trimmed;
  const parts = firstSegment.split(/\s+/);
  return parts[0] || '';
}

function getTargetPath(command: string): string | null {
  // For shell: extract any path-like args
  const tokens = command.split(/\s+/).slice(1);
  for (const tok of tokens) {
    if (tok.startsWith('-')) continue; // skip flags
    if (tok.includes('/') || tok.startsWith('~') || tok.startsWith('/')) {
      return tok.replace(/^~/, process.env['HOME'] || '/home/ai');
    }
  }
  return null;
}

function isReadOnly(tool: string): boolean {
  return READ_ONLY_TOOLS.has(tool);
}

function isWriteLike(tool: string): boolean {
  return WRITE_TOOLS.has(tool);
}

function isInWorkspace(target: string, callerHome: string): boolean {
  if (!target) return false;
  if (target === callerHome) return true;
  if (target.startsWith(callerHome + '/')) return true;
  return false;
}

function isInAnyHome(target: string, memberHomes: string[]): boolean {
  for (const home of memberHomes) {
    if (target === home) return true;
    if (target.startsWith(home + '/')) return true;
  }
  return false;
}

function getCallerHome(caller: string): string {
  return `/home/ai/${caller}`;
}

function isSensitivePath(target: string, markers: string[]): boolean {
  for (const marker of markers) {
    if (target.includes(marker)) return true;
  }
  return false;
}

function globMatch(pattern: string, filePath: string): boolean {
  // Convert glob pattern to regex
  // ** matches any path (including /), * matches one segment (no /)
  let regexStr = pattern;
  // Escape regex special chars except *
  regexStr = regexStr.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  // Convert ** to match anything
  regexStr = regexStr.replace(/\*\*/g, '##GLOBSTAR##');
  // Convert * to match non-slash chars
  regexStr = regexStr.replace(/\*/g, '[^/]*');
  // Restore globstar as match-anything
  regexStr = regexStr.replace(/##GLOBSTAR##/g, '.*');
  const regex = new RegExp('^' + regexStr + '$');
  return regex.test(filePath);
}

function isInAllowedPaths(target: string, allowedPaths: string[]): boolean {
  for (const p of allowedPaths) {
    if (globMatch(p, target)) return true;
  }
  return false;
}

export const sensitivePathGate: Middleware = (ctx) => {
  const config = loadSensitivePathConfig();
  const command = ctx.commandForValidation || ctx.command;
  const tool = getCommandName(command);
  const target = getTargetPath(command);

  // No target path → not path-related, allow
  if (!target) return ctx;

  const resolved = path.resolve(target);

  // 1. Sensitive path check (highest priority)
  if (isSensitivePath(resolved, config.sensitive_markers)) {
    logRejection({
      command: ctx.command,
      caller: ctx.caller,
      reason: `Sensitive path operation requires authorization: ${resolved}`,
      category: 'sensitive_path',
      session_id: ctx.session_id,
      shell: ctx.shell,
    });
    ctx.reject(
      `Sensitive path operation requires authorization: ${resolved}`,
      'sensitive_path'
    );
    return ctx;
  }

  // 2. Cross-member path check
  if (isInAnyHome(resolved, config.member_homes)) {
    const callerHome = getCallerHome(ctx.caller);
    if (!isInWorkspace(resolved, callerHome)) {
      // Cross-member: 显式 allowed list + ask otherwise
      if (isWriteLike(tool)) {
        if (!isInAllowedPaths(resolved, config.allowed_cross_member_writes)) {
          logRejection({
            command: ctx.command,
            caller: ctx.caller,
            reason: `Cross-member write requires authorization: ${resolved}`,
            category: 'cross_member',
            session_id: ctx.session_id,
            shell: ctx.shell,
          });
          ctx.reject(
            `Cross-member write requires authorization: ${resolved}`,
            'cross_member'
          );
          return ctx;
        }
      } else if (isReadOnly(tool)) {
        // Read-only cross-member reads also need explicit allowlist
        if (!isInAllowedPaths(resolved, config.allowed_cross_member_reads)) {
          logRejection({
            command: ctx.command,
            caller: ctx.caller,
            reason: `Cross-member read requires authorization: ${resolved}`,
            category: 'cross_member',
            session_id: ctx.session_id,
            shell: ctx.shell,
          });
          ctx.reject(
            `Cross-member read requires authorization: ${resolved}`,
            'cross_member'
          );
          return ctx;
        }
      } else {
        // Mixed/unknown tool
        if (!isInAllowedPaths(resolved, config.allowed_cross_member_reads)) {
          logRejection({
            command: ctx.command,
            caller: ctx.caller,
            reason: `Cross-member operation requires authorization: ${resolved}`,
            category: 'cross_member',
            session_id: ctx.session_id,
            shell: ctx.shell,
          });
          ctx.reject(
            `Cross-member operation requires authorization: ${resolved}`,
            'cross_member'
          );
          return ctx;
        }
      }
    }
  }

  // 3. In-workspace: read OK, write needs allowlist
  const callerHome = getCallerHome(ctx.caller);
  if (isInWorkspace(resolved, callerHome)) {
    if (isWriteLike(tool) || isReadOnly(tool)) {
      // For in-workspace writes, only allow if explicit allowlist
      if (
        isWriteLike(tool) &&
        !isInAllowedPaths(resolved, config.allowed_paths)
      ) {
        logRejection({
          command: ctx.command,
          caller: ctx.caller,
          reason: `In-workspace write requires authorization: ${resolved}`,
          category: 'in_workspace_write',
          session_id: ctx.session_id,
          shell: ctx.shell,
        });
        ctx.reject(
          `In-workspace write requires authorization: ${resolved}`,
          'in_workspace_write'
        );
        return ctx;
      }
    }
  } else if (isInWorkspace(resolved, '/tmp')) {
    // /tmp universal — allow
    return ctx;
  } else {
    // Outside any known home and not /tmp — default Deny unless allowed
    if (!isInAllowedPaths(resolved, config.allowed_paths)) {
      logRejection({
        command: ctx.command,
        caller: ctx.caller,
        reason: `Path outside allowed paths requires authorization: ${resolved}`,
        category: 'outside_paths',
        session_id: ctx.session_id,
        shell: ctx.shell,
      });
      ctx.reject(
        `Path outside allowed paths requires authorization: ${resolved}`,
        'outside_paths'
      );
      return ctx;
    }
  }

  return ctx;
};

// Helper: async check for T0 (used by l5_5_recheck if added)
export async function fetchT0Check(_args: {
  caller: string;
  command: string;
  trace_id?: string;
  timeout_ms: number;
}): Promise<SensitivePathOutcome> {
  // Default: allow for now (T0 RPC integration pending)
  return 'proceed';
}
