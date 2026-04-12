/**
 * Session Snapshot Generator
 * Produces an end-of-session behavioral summary
 */

import type {
  DecisionRecord,
  SessionSnapshot,
  BehavioralViolation,
} from '@ling/protocol';
import * as crypto from 'crypto';

const NETWORK_RE = /\b(curl|wget|nc|netcat|telnet|ssh|scp|rsync)\b/;
const FILE_READ_RE =
  /\b(cat|head|tail|less|more|grep|awk|sed|find|stat|file|diff)\b/;
const FILE_WRITE_RE = /\b(mkdir|touch|cp|mv|tee|dd|truncate|install|rename)\b/;
const PATH_EXTRACT_RE = /(?:[\s=])(\/[^\s;|&><'"()]+)/g;

function extractPaths(command: string): string[] {
  const paths: string[] = [];
  let match;
  while ((match = PATH_EXTRACT_RE.exec(command)) !== null) {
    paths.push(match[1]);
  }
  return paths;
}

export function generateSnapshot(
  sessionId: string,
  sessionName: string,
  createdAt: string,
  decisions: DecisionRecord[],
  violations: BehavioralViolation[]
): SessionSnapshot {
  const now = new Date();
  const created = new Date(createdAt);
  const durationSeconds = Math.round(
    (now.getTime() - created.getTime()) / 1000
  );

  const dirs = new Set<string>();
  const filesRead = new Set<string>();
  const filesWritten = new Set<string>();
  const networkCommands: string[] = [];
  let mismatchedOutcomes = 0;

  for (const d of decisions) {
    const paths = extractPaths(d.command);
    for (const p of paths) {
      dirs.add(p.split('/').slice(0, -1).join('/') || '/');
    }

    if (NETWORK_RE.test(d.command)) {
      networkCommands.push(d.command);
    }
    if (FILE_READ_RE.test(d.command)) {
      paths.forEach((p) => filesRead.add(p));
    }
    if (FILE_WRITE_RE.test(d.command)) {
      paths.forEach((p) => filesWritten.add(p));
    }

    if (!d.success) {
      mismatchedOutcomes++;
    }
  }

  return {
    session_id: sessionId,
    session_name: sessionName,
    created_at: createdAt,
    destroyed_at: now.toISOString(),
    duration_seconds: durationSeconds,
    commands_executed: decisions.length,
    directories_accessed: [...dirs].sort(),
    files_read: [...filesRead].sort(),
    files_written: [...filesWritten].sort(),
    network_commands: networkCommands,
    env_changes: {},
    decision_log: decisions,
    outcome_deviation_rate:
      decisions.length > 0 ? mismatchedOutcomes / decisions.length : 0,
    behavioral_violations: violations,
  };
}

export function hashOutput(output: string): string {
  return crypto.createHash('sha256').update(output).digest('hex').slice(0, 16);
}
