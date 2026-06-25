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

  const patternResult = securityValidator.validateCommandPatternsOnly(
    ctx.commandForValidation
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
