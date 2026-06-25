/**
 * Identity Check Middleware (L0)
 * Verifies caller is a registered 灵族 member.
 */

import { isKnownMember } from '../security/identity.js';
import type { Middleware } from '../pipeline/middleware.js';
import { logRejection } from '../audit/rejection_log.js';

export const identityCheck: Middleware = (ctx) => {
  if (!ctx.caller) {
    logRejection({
      command: ctx.command,
      caller: 'unknown',
      reason: 'Caller identity is required',
      category: 'unauthorized',
      session_id: ctx.session_id,
      shell: ctx.shell,
    });
    ctx.reject(
      'Caller identity is required. Provide a registered 灵族 member name.',
      'unauthorized'
    );
    return ctx;
  }
  if (!isKnownMember(ctx.caller)) {
    logRejection({
      command: ctx.command,
      caller: ctx.caller,
      reason: `Unknown caller: '${ctx.caller}' is not a registered 灵族 member`,
      category: 'unauthorized',
      session_id: ctx.session_id,
      shell: ctx.shell,
    });
    ctx.reject(
      `Unknown caller: '${ctx.caller}' is not a registered 灵族 member`,
      'unauthorized'
    );
  }
  return ctx;
};
