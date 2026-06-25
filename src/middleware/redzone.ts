/**
 * Red Zone Authorization Middleware (L3)
 * For red-zone commands (ssh, curl, npm, etc.), requires authorization_id
 * and verifies it via checkRedZoneAuthorization.
 */

import { securityValidator } from '../security/validator.js';
import { checkRedZoneAuthorization } from '../tools/authorize.js';
import type { Middleware } from '../pipeline/middleware.js';
import { logRejection } from '../audit/rejection_log.js';

export const redZoneAuth: Middleware = (ctx) => {
  const category = securityValidator.categorize(ctx.commandForValidation);
  if (category !== 'red_zone') return ctx;

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
