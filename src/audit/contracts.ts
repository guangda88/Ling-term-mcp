/**
 * Behavioral Contract Engine
 * Detects dangerous combinations of individually-legitimate operations
 */

import type {
  DecisionRecord,
  BehavioralViolation,
  BehavioralRule,
} from '@ling/protocol';

const RULES: BehavioralRule[] = [
  {
    id: 'network-after-sensitive-read',
    name: 'Network After Sensitive Read',
    description:
      'Network command issued within 5 minutes of reading sensitive files',
    severity: 'high',
    evaluate(history: DecisionRecord[], _context: Record<string, unknown>) {
      const lastDecision = history[history.length - 1];
      if (!lastDecision) return null;

      const isNetwork = /\b(curl|wget|nc|netcat|telnet|ssh|scp|rsync)\b/.test(
        lastDecision.command
      );
      if (!isNetwork) return null;

      const recentSensitiveRead = history.some(
        (h) =>
          h.success &&
          h.command !== lastDecision.command &&
          /\/(etc|shadow|passwd|ssh|gnupg|\.ssh|\.env|secret|credential)\b/.test(
            h.command
          ) &&
          Date.now() - new Date(h.timestamp).getTime() < 5 * 60 * 1000
      );

      if (recentSensitiveRead) {
        return {
          rule: 'network-after-sensitive-read',
          message:
            'Network command issued within 5 minutes of reading sensitive files',
          timestamp: new Date().toISOString(),
          severity: 'high',
          details: { command: lastDecision.command },
        };
      }
      return null;
    },
  },
  {
    id: 'rapid-command-burst',
    name: 'Rapid Command Burst',
    description: 'Too many commands executed in a short time window',
    severity: 'medium',
    evaluate(history: DecisionRecord[], _context: Record<string, unknown>) {
      const lastDecision = history[history.length - 1];
      if (!lastDecision) return null;

      const windowMs = 60_000;
      const threshold = 30;
      const recent = history.filter(
        (h) =>
          Date.now() - new Date(h.timestamp).getTime() < windowMs &&
          h.session_id === lastDecision.session_id
      );
      if (recent.length >= threshold) {
        return {
          rule: 'rapid-command-burst',
          message: `${recent.length} commands in 60 seconds (threshold: ${threshold})`,
          timestamp: new Date().toISOString(),
          severity: 'medium',
          details: { count: recent.length },
        };
      }
      return null;
    },
  },
  {
    id: 'permission-change-after-write',
    name: 'Permission Change After Write',
    description:
      'Permission modification within 5 minutes of file write operations',
    severity: 'high',
    evaluate(history: DecisionRecord[], _context: Record<string, unknown>) {
      const lastDecision = history[history.length - 1];
      if (!lastDecision) return null;

      const isChmodChown = /\b(chmod|chown|chattr|acl)\b/.test(
        lastDecision.command
      );
      if (!isChmodChown) return null;

      const recentWrite = history.some(
        (h) =>
          h.success &&
          h.command !== lastDecision.command &&
          /\b(write|mkdir|touch|cp|mv|tee|redirect|>\s|>>)\b/.test(h.command) &&
          Date.now() - new Date(h.timestamp).getTime() < 5 * 60 * 1000
      );

      if (recentWrite) {
        return {
          rule: 'permission-change-after-write',
          message:
            'Permission modification within 5 minutes of file write operations',
          timestamp: new Date().toISOString(),
          severity: 'high',
          details: { command: lastDecision.command },
        };
      }
      return null;
    },
  },
];

export function checkBehavioralContracts(
  decision: DecisionRecord,
  history: DecisionRecord[]
): BehavioralViolation[] {
  const violations: BehavioralViolation[] = [];
  const historyWithContext = [...history, decision];
  for (const rule of RULES) {
    const violation = rule.evaluate(historyWithContext, {});
    if (violation) {
      violations.push(violation);
    }
  }
  return violations;
}
