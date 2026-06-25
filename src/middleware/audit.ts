/**
 * Audit Logger Middleware (onComplete hook)
 * Records command execution to session decision log and command history.
 */

import type { CompleteHook } from '../pipeline/middleware.js';
import { getMember } from '../security/identity.js';
import {
  appendCommandHistory,
  appendDecisionRecord,
} from '../sessions/store.js';
import { hashOutput } from '../audit/snapshot.js';
import { SourceType } from '../protocol/types.js';
import { sanitizeCommand } from '../middleware/output_sanitizer.js';

export const auditLogger: CompleteHook = (ctx) => {
  if (!ctx.session_id) return;

  // COM-01: sanitize command before writing to audit logs
  const fullCmd = sanitizeCommand(
    ctx.shell ? ctx.command : [ctx.command, ...(ctx.cmdArgs || [])].join(' ')
  );
  const success = ctx.result ? ctx.result.exit_code === 0 : false;
  const output = ctx.result ? ctx.result.stdout || ctx.result.stderr || '' : '';

  appendCommandHistory(ctx.session_id, fullCmd).catch((e) =>
    console.error('[audit] appendCommandHistory failed:', e)
  );

  const member = getMember(ctx.caller);
  appendDecisionRecord(ctx.session_id, {
    timestamp: new Date().toISOString(),
    command: fullCmd,
    reasoning: ctx.reasoning || '',
    expected_outcome: ctx.expected_outcome || '',
    actual_outcome_hash: hashOutput(output),
    success,
    session_id: ctx.session_id,
    source_trace: [
      {
        type: SourceType.VERIFIED,
        timestamp: new Date().toISOString(),
        origin: ctx.caller,
        confidence: 1.0,
        metadata: member ? { role: member.role } : undefined,
      },
    ],
  }).catch((e) => console.error('[audit] appendDecisionRecord failed:', e));
};
