/**
 * Pattern Check Middleware
 * Detects dangerous patterns (rm -rf /, curl|bash, etc.).
 * Always runs regardless of command category.
 */

import { securityValidator } from '../security/validator.js';
import type { Middleware } from '../pipeline/middleware.js';
import { logRejection } from '../audit/rejection_log.js';

const SHELL_BUILTINS = new Set([
  'export',
  'set',
  'unset',
  'source',
  'alias',
  'unalias',
  'type',
  'readonly',
  'local',
  'declare',
]);

export const patternCheck: Middleware = (ctx) => {
  // For shell builtin commands (not in whitelist), rewrite to 'echo' for
  // whitelist/blacklist validation, but always run raw pattern check.
  if (ctx.shell) {
    const firstWord = ctx.command.trim().split(/\s+/)[0];
    if (SHELL_BUILTINS.has(firstWord)) {
      const rawCheck = securityValidator.validateCommandPatternsOnly(
        ctx.command
      );
      if (!rawCheck.valid) {
        logRejection({
          command: ctx.command,
          caller: ctx.caller,
          reason: rawCheck.error ?? 'pattern check failed',
          category: 'builtin_pattern',
          session_id: ctx.session_id,
          shell: ctx.shell,
        });
        ctx.reject(rawCheck.error ?? 'pattern check failed', 'builtin_pattern');
        return ctx;
      }
      const rest = ctx.command.trim().slice(firstWord.length);
      ctx.commandForValidation = 'echo' + rest;
    }
  }

  // 双路解析器共用（呼应灵通第0项：探测/转发语义统一）:
  // shell=true 时校验完整命令串（含元字符语义）；
  // shell=false 时 execFile 直传 command+args，args 是字面量——
  // 探测必须覆盖完整 argv 的危险模式，但不套用 shell 元字符规则。
  const validationTarget =
    ctx.shell || !ctx.cmdArgs || ctx.cmdArgs.length === 0
      ? ctx.commandForValidation
      : [ctx.command, ...ctx.cmdArgs].join(' ');
  const patternResult = securityValidator.validateCommandPatternsOnly(
    validationTarget,
    ctx.shell
  );
  if (!patternResult.valid) {
    logRejection({
      command: ctx.command,
      caller: ctx.caller,
      reason: patternResult.error ?? 'pattern check failed',
      category: 'pattern',
      session_id: ctx.session_id,
      shell: ctx.shell,
    });
    ctx.reject(patternResult.error ?? 'pattern check failed', 'pattern');
  }
  return ctx;
};
