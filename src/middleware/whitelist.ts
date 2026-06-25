/**
 * Whitelist Check Middleware (L2)
 * For unknown commands (not in whitelist, not blacklisted, not red-zone),
 * runs full validation including metachar and interpreter RCE checks.
 */

import { securityValidator } from '../security/validator.js';
import type { Middleware } from '../pipeline/middleware.js';
import { logRejection } from '../audit/rejection_log.js';

export const whitelistCheck: Middleware = (ctx) => {
  const category = securityValidator.categorize(ctx.commandForValidation);
  if (category !== 'unknown') return ctx;

  const cmdArgs = ctx.shell ? [] : ctx.cmdArgs || [];
  const check = securityValidator.validateCommand(
    ctx.commandForValidation,
    cmdArgs,
    ctx.shell
  );
  if (!check.valid) {
    logRejection({
      command: ctx.command,
      caller: ctx.caller,
      reason: check.error ?? 'unknown command validation failed',
      category: 'unknown',
      session_id: ctx.session_id,
      shell: ctx.shell,
    });
    ctx.reject(check.error ?? 'unknown command validation failed', 'unknown');
  }
  return ctx;
};
