/**
 * Blacklist Check Middleware (L1)
 *
 * Two-tier security model:
 *   - DEFAULT_BLACKLIST: hard-reject (no authorization path)
 *   - AUTHORIZABLE_COMMANDS (kill/rm/chmod/...): route to authorization path.
 *     If authorization_id is present and valid (approved + caller match),
 *     the command is allowed through. Otherwise rejected.
 */

import { securityValidator } from '../security/validator.js';
import { checkRedZoneAuthorization } from '../tools/authorize.js';
import type { Middleware } from '../pipeline/middleware.js';
import { logRejection } from '../audit/rejection_log.js';

export const blacklistCheck: Middleware = (ctx) => {
  const category = securityValidator.categorize(ctx.commandForValidation);

  // Absolutely forbidden — no escape path
  if (category === 'blacklisted') {
    const cmd = ctx.commandForValidation.split(' ')[0];
    console.error(
      `[security] Command rejected (blacklisted): "${ctx.command}" (caller: ${ctx.caller})`
    );
    logRejection({
      command: ctx.command,
      caller: ctx.caller,
      reason: `Command '${cmd}' is blacklisted`,
      category: 'blacklisted',
      session_id: ctx.session_id,
      shell: ctx.shell,
    });
    ctx.reject(
      `Command '${cmd}' is blacklisted for security reasons`,
      'blacklisted'
    );
    return ctx;
  }

  // Authorizable — requires valid authorization to escape
  if (category === 'authorizable') {
    const cmd = ctx.commandForValidation.split(' ')[0];

    if (!ctx.authorization_id) {
      console.error(
        `[security] Authorizable command blocked (no auth): "${ctx.command}" (caller: ${ctx.caller})`
      );
      logRejection({
        command: ctx.command,
        caller: ctx.caller,
        reason: `Command '${cmd}' requires authorization. Use authorize tool (command=require) first.`,
        category: 'authorizable',
        session_id: ctx.session_id,
        shell: ctx.shell,
      });
      ctx.reject(
        `Command '${cmd}' requires authorization. Use authorize tool (command=require) first.`,
        'authorizable'
      );
      return ctx;
    }

    const auth = checkRedZoneAuthorization(
      ctx.authorization_id,
      ctx.command,
      ctx.caller
    );
    if (!auth.allowed) {
      console.error(
        `[security] Authorizable command blocked (auth failed): "${ctx.command}" (caller: ${ctx.caller})`
      );
      logRejection({
        command: ctx.command,
        caller: ctx.caller,
        reason: auth.error ?? 'authorization denied',
        category: 'authorizable',
        session_id: ctx.session_id,
        shell: ctx.shell,
      });
      ctx.reject(`Authorization failed: ${auth.error}`, 'authorizable');
      return ctx;
    }
  }

  return ctx;
};
