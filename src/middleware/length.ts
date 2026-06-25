/**
 * Length Check Middleware
 * Rejects commands exceeding maximum length (10K chars).
 */

import { securityValidator } from '../security/validator.js';
import type { Middleware } from '../pipeline/middleware.js';
import { logRejection } from '../audit/rejection_log.js';

export const lengthCheck: Middleware = (ctx) => {
  const fullCommand =
    ctx.cmdArgs && ctx.cmdArgs.length > 0
      ? [ctx.command, ...ctx.cmdArgs].join(' ')
      : ctx.command;
  const result = securityValidator.validateCommand(
    fullCommand,
    ctx.cmdArgs || [],
    ctx.shell
  );
  if (!result.valid && result.error?.includes('exceeds maximum length')) {
    logRejection({
      command: ctx.command,
      caller: ctx.caller,
      reason: result.error,
      category: 'pattern',
      session_id: ctx.session_id,
      shell: ctx.shell,
    });
    ctx.reject(result.error!, 'pattern');
  }
  return ctx;
};
