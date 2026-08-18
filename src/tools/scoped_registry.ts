/**
 * Scoped Tool Registry — per-caller tool visibility.
 *
 * 薄设计（灵元视角）：一张 tool→scopes 映射表 + 一个过滤函数。
 * 不引入框架，不改 tool 定义，只在 ListTools 出口处过滤。
 *
 * 数据流：
 *   ListTools 请求 → getCallerFromRequest() → filterTools(caller, allTools)
 *   CallTool 请求 → 现有安全校验（identity + blacklist）不变
 *
 * 注：ListTools 的 caller 识别依赖 MCP client 在 initialize 时
 * 通过 clientInfo.name 传递成员标识。未知 caller 得默认集（保守）。
 */

import { isKnownMember } from '../security/identity.js';

export interface ToolEntry {
  definition: unknown;
  handler: (args: unknown) => Promise<unknown>;
}

/**
 * 工具可见域：
 * - 'all'     — 所有已知成员 + 未知 caller 可见（默认）
 * - 'admin'   — 治理/授权类，仅治理参与者可见
 * - 'member'  — 仅已知灵族成员可见（基础设施类如 caller_secret 分发）
 */
export type ToolScope = 'all' | 'admin' | 'member';

const TOOL_SCOPES: Record<string, ToolScope> = {
  // 通用工具：全员可见
  execute_command: 'all',
  session: 'all',
  poll_messages: 'all',
  post_reply: 'all',
  open_thread: 'all',
  lm_query: 'all',
  lm_create: 'all',
  lm_transition: 'all',
  lm_record_info: 'all',
  lm_search: 'all',
  lm_get: 'all',
  search: 'all',
  code_search: 'all',
  code_search_remote: 'all',
  extract: 'all',
  gateway: 'all',

  // 治理/授权：admin 域
  authorize: 'admin',
  governance: 'admin',
  audit_report: 'admin',
  info_delta: 'admin',
  visible_state: 'admin',

  // 成员专属：基础设施类，外部未知 caller 不可见
  proxy: 'member',
  distribute_caller_secret: 'member',
  read_caller_signature: 'member',
};

/**
 * 治理参与者（可访问 admin 域工具的 caller）。
 * 与灵族治理流程对齐：十二子 + 智桥 + atomcode。
 */
const ADMIN_CALLERS: ReadonlySet<string> = new Set([
  'lingclaude',
  'lingflow',
  'lingflow_plus',
  'lingmessage',
  'lingan',
  'lingxi',
  'lingresearch',
  'lingzhi',
  'lingminopt',
  'lingweb',
  'lingyang',
  'lingtongask',
  'lingcreate',
  'zhibridge',
  'atomcode',
  'webui_user',
]);

/**
 * 过滤单个工具：caller 是否可见。
 * caller 为 undefined（未识别）时仅暴露 'all' 域。
 */
export function isToolVisible(
  toolName: string,
  caller: string | undefined
): boolean {
  const scope = TOOL_SCOPES[toolName] ?? 'all';
  switch (scope) {
    case 'all':
      return true;
    case 'member':
      return caller !== undefined && isKnownMember(caller);
    case 'admin':
      return caller !== undefined && ADMIN_CALLERS.has(caller);
  }
}

/**
 * 过滤工具列表：返回 caller 可见的子集。
 */
export function filterTools<T extends { name: string }>(
  tools: T[],
  caller: string | undefined
): T[] {
  return tools.filter((t) => isToolVisible(t.name, caller));
}

/**
 * 从 MCP initialize 的 clientInfo 提取 caller。
 * client 约定：name 形如 "lingclaude-crush" / "crush (lingxi)"，
 * 取第一个已知成员名子串。
 */
export function getCallerFromClientInfo(
  clientName: string | undefined
): string | undefined {
  if (!clientName) return undefined;
  const lower = clientName.toLowerCase();
  // 成员名按长度倒序匹配，避免 lingflow 先命中 lingflow_plus
  const candidates = [...ADMIN_CALLERS].sort((a, b) => b.length - a.length);
  for (const name of candidates) {
    if (lower.includes(name.toLowerCase())) return name;
  }
  return undefined;
}
