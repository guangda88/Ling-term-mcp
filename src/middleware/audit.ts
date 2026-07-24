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
import { detectIdentityDrift } from '../layers/l10_trust_anchor.js';
import { isProtected } from '../layers/l10_operation_gate.js';

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
  const traceId = `${ctx.caller}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  appendDecisionRecord(ctx.session_id, {
    timestamp: new Date().toISOString(),
    command: fullCmd,
    trace_id: traceId,
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
        metadata: {
          trace_id: traceId,
          ...(member ? { role: member.role } : {}),
        },
      },
    ],
  }).catch((e) => console.error('[audit] appendDecisionRecord failed:', e));

  // L10 identity drift detection: check command output for non-灵族 identity
  if (output) {
    const drift = detectIdentityDrift(output);
    if (drift) {
      console.error(
        `[L10] identity_drift detected: pattern="${drift.matched}" confidence=${drift.confidence} caller=${ctx.caller} session=${ctx.session_id}`
      );
    }
  }

  // L10 operation gate: check write commands against protected files
  if (ctx.command && success) {
    const writeMatch = fullCmd.match(
      /^(?:rm|mv|cp|touch|chmod|chown|mkdir|write|tee|dd)\s+(\S+)/
    );
    if (writeMatch) {
      const targetPath = writeMatch[1];
      if (isProtected(targetPath)) {
        console.error(
          `[L10] protected_file_write: ${targetPath} by ${ctx.caller} session=${ctx.session_id}`
        );
      }
    }
  }
};
