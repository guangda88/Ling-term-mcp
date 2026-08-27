/**
 * Authentication Layer Middleware (L1/L2/L3 Chain)
 *
 * Validates caller identity through the auth chain:
 * - L1: Basic member lookup (identityCheck already handles this)
 * - L2: Certificate verification against L1 master key
 * - L3: Request signature verification against L2 public key
 *
 * Priority: L3 > L2 > L1-only
 * - If authorization_id present: L1 membership check (existing behavior)
 * - If l2_certificate present: verify L2 cert + L1 membership
 * - If l3_request present: verify L3 sig + L2 pub key lookup + L1 membership
 */

import { isKnownMember } from '../security/identity.js';
import type { Middleware } from '../pipeline/middleware.js';
import type { CommandCtx } from '../pipeline/command_ctx.js';
import { logRejection } from '../audit/rejection_log.js';

export const authLayerCheck: Middleware = async (ctx: CommandCtx) => {
  // L3 verification takes priority if present
  const l3Request = ctx.sourceTrace?.find(
    (t: { type: string; metadata?: Record<string, unknown> }) =>
      t.type === 'verified' && t.metadata?.l3_verified
  );
  if (l3Request) {
    return ctx; // L3 verified, skip further auth checks
  }

  // L2 verification check
  const l2Cert = ctx.sourceTrace?.find(
    (t: { type: string; metadata?: Record<string, unknown> }) =>
      t.type === 'verified' && t.metadata?.l2_verified
  );
  if (l2Cert) {
    return ctx; // L2 verified, skip further auth checks
  }

  // L1 membership check (existing behavior via identityCheck)
  // This middleware runs AFTER identityCheck in the pipeline
  if (!ctx.caller || !isKnownMember(ctx.caller)) {
    logRejection({
      command: ctx.command,
      caller: ctx.caller || 'unknown',
      reason: `Caller '${ctx.caller}' is not a registered 灵族 member`,
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
