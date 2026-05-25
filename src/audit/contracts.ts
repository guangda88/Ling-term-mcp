/**
 * Behavioral Contract Engine
 * Detects dangerous combinations of individually-legitimate operations
 */

import type {
  DecisionRecord,
  BehavioralViolation,
  BehavioralRule,
} from '../protocol/types.js';
import { getRegistryContext } from './registry_loader.js';

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
  {
    id: 'self-driven-publish-guard',
    name: 'Self-Driven Publish Guard',
    description:
      'External publish operations (git push, API POST to external services) detected in self-driven task context',
    severity: 'critical',
    evaluate(history: DecisionRecord[], _context: Record<string, unknown>) {
      const lastDecision = history[history.length - 1];
      if (!lastDecision) return null;

      const publishPatterns =
        /\b(git\s+push|git\s+remote)\b|\b(curl|wget)\s+.*(-X\s+POST|--request\s+POST|-X\s+PUT|--request\s+PUT)\b/i;
      if (!publishPatterns.test(lastDecision.command)) return null;

      const isSelfDriven = history.some(
        (h) =>
          /self.driven|自驱任务|SDT-/.test(h.command) &&
          Date.now() - new Date(h.timestamp).getTime() < 30 * 60 * 1000
      );

      if (isSelfDriven) {
        return {
          rule: 'self-driven-publish-guard',
          message:
            'Publish operation blocked in self-driven task context. Self-driven tasks must not produce externally visible output.',
          timestamp: new Date().toISOString(),
          severity: 'critical',
          details: { command: lastDecision.command },
        };
      }
      return null;
    },
  },
  {
    id: 'self-driven-scope-guard',
    name: 'Self-Driven Scope Guard',
    description:
      'Write operation outside declared output directory in self-driven task context',
    severity: 'high',
    evaluate(history: DecisionRecord[], context: Record<string, unknown>) {
      const lastDecision = history[history.length - 1];
      if (!lastDecision) return null;

      const writePattern =
        /\b(write|mkdir|cp\s|mv\s|tee|>\s|>>)\b|\b(touch|ln\s)/;
      if (!writePattern.test(lastDecision.command)) return null;

      const allowedDir = context.allowedOutputDir as string | undefined;
      if (!allowedDir) return null;

      const isSelfDriven = history.some(
        (h) =>
          /self.driven|自驱任务|SDT-/.test(h.command) &&
          Date.now() - new Date(h.timestamp).getTime() < 30 * 60 * 1000
      );

      if (
        isSelfDriven &&
        !lastDecision.command.includes(allowedDir) &&
        !lastDecision.command.includes('.audit/') &&
        !lastDecision.command.includes('/tmp/')
      ) {
        return {
          rule: 'self-driven-scope-guard',
          message: `Write outside allowed directory "${allowedDir}" in self-driven task context`,
          timestamp: new Date().toISOString(),
          severity: 'high',
          details: {
            command: lastDecision.command,
            allowedDir,
          },
        };
      }
      return null;
    },
  },
  {
    id: 'self-driven-no-modify-shared',
    name: 'Self-Driven No Modify Shared',
    description:
      'Modification of shared resources (other members code, shared DB) in self-driven task context',
    severity: 'critical',
    evaluate(history: DecisionRecord[], context: Record<string, unknown>) {
      const lastDecision = history[history.length - 1];
      if (!lastDecision) return null;

      const caller = (context.caller as string) || '';
      const writePattern =
        /\b(write|mkdir|cp\s|mv\s|tee|>\s|>>)\b|\b(touch|ln\s)/;
      if (!writePattern.test(lastDecision.command)) return null;

      const isSelfDriven = history.some(
        (h) =>
          /self.driven|自驱任务|SDT-/.test(h.command) &&
          Date.now() - new Date(h.timestamp).getTime() < 30 * 60 * 1000
      );

      if (!isSelfDriven) return null;

      const memberDirs: Record<string, string> = {
        lingclaude: '/home/ai/lingclaude',
        lingflow: '/home/ai/lingflow',
        lingflow_plus: '/home/ai/lingflow_plus',
        lingyang: '/home/ai/lingyang',
        lingweb: '/home/ai/lingweb',
        lingzhi: '/home/ai/lingzhi',
        lingresearch: '/home/ai/lingresearch',
        lingminopt: '/home/ai/lingminopt',
        lingtongask: '/home/ai/lingtongask',
        lingxi: '/home/ai/lingxi',
        lingmessage: '/home/ai/lingmessage',
        zhibridge: '/home/ai/zhibridge',
      };

      const callerDir = memberDirs[caller];
      if (!callerDir) return null;

      for (const [member, dir] of Object.entries(memberDirs)) {
        if (member === caller) continue;
        if (
          lastDecision.command.includes(dir) &&
          !lastDecision.command.includes('.audit/')
        ) {
          return {
            rule: 'self-driven-no-modify-shared',
            message: `Self-driven task attempting to modify ${member}'s code at ${dir}`,
            timestamp: new Date().toISOString(),
            severity: 'critical',
            details: {
              command: lastDecision.command,
              caller,
              targetDir: dir,
              targetMember: member,
            },
          };
        }
      }
      return null;
    },
  },
];

export function checkBehavioralContracts(
  decision: DecisionRecord,
  history: DecisionRecord[],
  caller?: string
): BehavioralViolation[] {
  const violations: BehavioralViolation[] = [];
  const historyWithContext = [...history, decision];
  const registryCtx = caller ? getRegistryContext(caller) : {};
  const mergedContext = { ...registryCtx };
  for (const rule of RULES) {
    const violation = rule.evaluate(historyWithContext, mergedContext);
    if (violation) {
      violations.push(violation);
    }
  }
  return violations;
}
