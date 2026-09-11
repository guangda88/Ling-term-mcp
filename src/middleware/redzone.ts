/**
 * Red Zone Authorization Middleware (L3)
 * For red-zone commands (ssh, curl, npm, etc.), requires authorization_id
 * and verifies it via checkRedZoneAuthorization.
 *
 * 2026-08-23 改进 #4：增加 path-aware 豁免
 * - /tmp 下的 .py / .js 脚本（用户调试脚本）：跳过 red_zone 检查，无需 authorization_id
 * - 配置可通过环境变量 LING_TMP_SCRIPT_EXEMPT=1 开启（默认关闭）
 */

import { securityValidator } from '../security/validator.js';
import { checkRedZoneAuthorization } from '../tools/authorize.js';
import type { Middleware } from '../pipeline/middleware.js';
import { logRejection } from '../audit/rejection_log.js';

// 2026-08-23 改进 #4：path-aware 豁免（默认关闭，需显式开启）
// 仅豁免 /tmp 下的脚本调用，避免调试场景被全局放开 python3/node
const TMP_SCRIPT_EXEMPT_ENABLED =
  (process.env.LING_TMP_SCRIPT_EXEMPT ?? '0') === '1';

// 解释器列表：识别 "python3 /tmp/foo.py" / "npx /tmp/foo.js" 形式
const INTERPRETER_RE =
  '(?:python|python3|node|nodejs|ts-node|npx|npm|pnpm|yarn|pip|pip3|bun|deno)';

// 2026-08-23 v2 修复：正则改为捕获 interpreter 后的脚本路径（而非首词）
// 兼容形式：python3 /tmp/foo.py、npx /tmp/foo.js、node /tmp/foo.js、python /tmp/foo.py 等
const TMP_SCRIPT_PATTERN = new RegExp(
  '^\\s*(?:[A-Z_][A-Z0-9_]*=[^ ]+ +)*' + // 可选 leading env vars
    '(?:' +
    INTERPRETER_RE +
    ')\\s+' + // 必须有解释器前缀
    '[\'"]?(\\/tmp\\/[^\\\'";&|`$()<>\\s]+\\.(?:py|js|ts|sh))[\'"]?', // 捕获 /tmp/*.py
  'i'
);

/**
 * 从 ctx.commandForValidation 里提取 /tmp 下的脚本路径
 * 仅当形式为 `<interpreter> /tmp/script.{py,js,ts,sh}` 时返回路径
 * 否则返回 null（说明非豁免场景，不触发豁免分支）
 */
function extractTmpScriptPath(cmd: string): string | null {
  const m = (cmd || '').match(TMP_SCRIPT_PATTERN);
  return m ? m[1] : null;
}

export const redZoneAuth: Middleware = (ctx) => {
  const category = securityValidator.categorize(ctx.commandForValidation);
  if (category !== 'red_zone') return ctx;

  // 2026-08-23 改进 #4：path-aware 豁免检查（v2 修复索引）
  // 仅当命令形式为 `<interpreter> /tmp/script.{py,js,ts,sh}` 时跳过 red_zone
  if (TMP_SCRIPT_EXEMPT_ENABLED) {
    const tmpScript = extractTmpScriptPath(ctx.commandForValidation);
    if (tmpScript) {
      // /tmp 下脚本（带正确解释器前缀） → 跳过 red_zone 授权检查
      return ctx;
    }
  }

  if (!ctx.authorization_id) {
    logRejection({
      command: ctx.command,
      caller: ctx.caller,
      reason: `Red-zone command '${ctx.commandForValidation.split(' ')[0]}' requires authorization`,
      category: 'red_zone',
      session_id: ctx.session_id,
      shell: ctx.shell,
    });
    ctx.reject(
      `Red-zone command '${ctx.commandForValidation.split(' ')[0]}' requires authorization. Use authorize tool (command=require) first.`,
      'red_zone'
    );
    return ctx;
  }

  const auth = checkRedZoneAuthorization(
    ctx.authorization_id!,
    ctx.command,
    ctx.caller
  );
  if (!auth.allowed) {
    logRejection({
      command: ctx.command,
      caller: ctx.caller,
      reason: auth.error ?? 'authorization denied',
      category: 'red_zone',
      session_id: ctx.session_id,
      shell: ctx.shell,
    });
    ctx.reject(`Red-zone authorization failed: ${auth.error}`, 'red_zone');
  }
  return ctx;
};
