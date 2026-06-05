/**
 * Rejection Logger — persists security-rejected commands for audit visibility.
 *
 * Previously, commands blocked by the security validator were only logged to
 * stderr via console.error and never appeared in audit_report. This module
 * writes structured rejection records to a JSONL file that audit_report can
 * consume, closing the audit blind spot identified in the 3-direction
 * discussion (2026-06-05, reverse-thinking #2).
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

export interface RejectionRecord {
  id: string;
  timestamp: string;
  command: string;
  caller: string;
  reason: string;
  category:
    | 'blacklisted'
    | 'unknown'
    | 'red_zone'
    | 'pattern'
    | 'builtin_pattern'
    | 'unauthorized';
  session_id?: string;
  shell?: boolean;
}

const REJECTION_DIR = path.join(
  process.env['HOME'] || '/home/ai',
  '.ling-term-mcp'
);
const REJECTION_FILE = path.join(REJECTION_DIR, 'rejections.jsonl');
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

function ensureDir(): void {
  if (!fs.existsSync(REJECTION_DIR)) {
    fs.mkdirSync(REJECTION_DIR, { recursive: true });
  }
}

function rotateIfNeeded(): void {
  try {
    if (!fs.existsSync(REJECTION_FILE)) return;
    const stat = fs.statSync(REJECTION_FILE);
    if (stat.size > MAX_FILE_SIZE) {
      const archive = REJECTION_FILE.replace(
        '.jsonl',
        `_${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`
      );
      fs.renameSync(REJECTION_FILE, archive);
    }
  } catch {
    // Non-fatal: if rotation fails, continue appending
  }
}

/**
 * Log a rejected command to the persistent rejection log.
 * This closes the audit blind spot where blocked commands were invisible
 * to audit_report.
 */
export function logRejection(
  record: Omit<RejectionRecord, 'id' | 'timestamp'>
): void {
  try {
    ensureDir();
    rotateIfNeeded();
    const full: RejectionRecord = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...record,
    };
    fs.appendFileSync(REJECTION_FILE, JSON.stringify(full) + '\n', 'utf8');
  } catch {
    // Non-fatal: rejection logging must never block command execution flow
  }
}

/**
 * Read recent rejection records for audit reporting.
 */
export function readRejections(limit = 100): RejectionRecord[] {
  try {
    if (!fs.existsSync(REJECTION_FILE)) return [];
    const content = fs.readFileSync(REJECTION_FILE, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    const records: RejectionRecord[] = [];
    for (const line of lines) {
      try {
        records.push(JSON.parse(line) as RejectionRecord);
      } catch {
        // Skip malformed lines
      }
    }
    return records.slice(-limit);
  } catch {
    return [];
  }
}
