/**
 * Behavioral Contract Engine
 * Detects dangerous combinations of individually-legitimate operations
 */

import { DecisionRecord, BehavioralViolation } from './types.js';

interface BehavioralRule {
  name: string;
  check: (
    decision: DecisionRecord,
    history: DecisionRecord[]
  ) => BehavioralViolation | null;
}

const RULES: BehavioralRule[] = [
  {
    name: 'network-after-sensitive-read',
    check(decision, history) {
      const isNetwork = /\b(curl|wget|nc|netcat|telnet|ssh|scp|rsync)\b/.test(
        decision.command
      );
      if (!isNetwork) return null;

      const recentSensitiveRead = history.some(
        (h) =>
          h.success &&
          h.command !== decision.command &&
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
          details: { command: decision.command },
        };
      }
      return null;
    },
  },
  {
    name: 'rapid-command-burst',
    check(decision, history) {
      const windowMs = 60_000;
      const threshold = 30;
      const recent = history.filter(
        (h) =>
          Date.now() - new Date(h.timestamp).getTime() < windowMs &&
          h.session_id === decision.session_id
      );
      if (recent.length >= threshold) {
        return {
          rule: 'rapid-command-burst',
          message: `${recent.length} commands in 60 seconds (threshold: ${threshold})`,
          timestamp: new Date().toISOString(),
          details: { count: recent.length },
        };
      }
      return null;
    },
  },
  {
    name: 'permission-change-after-write',
    check(decision, history) {
      const isChmodChown = /\b(chmod|chown|chattr|acl)\b/.test(
        decision.command
      );
      if (!isChmodChown) return null;

      const recentWrite = history.some(
        (h) =>
          h.success &&
          h.command !== decision.command &&
          /\b(write|mkdir|touch|cp|mv|tee|redirect|>\s|>>)\b/.test(h.command) &&
          Date.now() - new Date(h.timestamp).getTime() < 5 * 60 * 1000
      );

      if (recentWrite) {
        return {
          rule: 'permission-change-after-write',
          message:
            'Permission modification within 5 minutes of file write operations',
          timestamp: new Date().toISOString(),
          details: { command: decision.command },
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
  for (const rule of RULES) {
    const violation = rule.check(decision, history);
    if (violation) {
      violations.push(violation);
    }
  }
  return violations;
}
