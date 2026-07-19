/**
 * Rejection → Datalog Adapter (L6 stub)
 *
 * Converts rejection_log records into the unified Datalog schema v1 format
 * defined in /home/ai/docs/DATALOG_SCHEMA_V1_DRAFT.md (P0.8).
 *
 * This is the L6 stub: passes rejection events through to a daily JSONL
 * file in `~/.lingxi/datalog/`. Once the schema is locked (7/22), the
 * `convertRejectionToDatalog` mapper is the only piece that needs to be
 * updated to match the final field names.
 *
 * L6 stub features:
 * - Append-only JSONL (per schema §5)
 * - Daily file rotation (`YYYY-MM-DD.jsonl`)
 * - Idempotent: writing the same record twice produces two distinct events
 *   (use `id` as dedup key if needed downstream)
 * - Sanitization: command content is hashed, never stored raw
 * - Toggleable via env var `LING_DATALOG_ENABLED=0` to disable without
 *   code changes (useful for tests and rollback)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { RejectionRecord } from './rejection_log.js';

export interface DatalogEvent {
  ts: string;
  member: string;
  event_type: string;
  session_id: string;
  status: string;
  error_type?: string;
  tool_name?: string;
  tool_output_hash?: string;
  data: Record<string, unknown>;
}

const DATALOG_DIR = (): string =>
  process.env['LING_DATALOG_DIR'] ||
  path.join(process.env['HOME'] || '/home/ai', '.lingxi', 'datalog');

function isDatalogEnabled(): boolean {
  return process.env['LING_DATALOG_ENABLED'] !== '0';
}

function ensureDatalogDir(): void {
  const dir = DATALOG_DIR();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function dateStringFor(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dailyFilePath(d: Date): string {
  return path.join(DATALOG_DIR(), `${dateStringFor(d)}.jsonl`);
}

function commandHash(command: string): string {
  return crypto.createHash('sha256').update(command).digest('hex').slice(0, 16);
}

/**
 * Map a rejection record to the unified Datalog schema v1 event.
 *
 * Field mapping (per /home/ai/docs/DATALOG_SCHEMA_V1_DRAFT.md §2 + §3):
 *   - ts            ← record.timestamp
 *   - member        ← "lingxi" (constant; this adapter's owner)
 *   - event_type    ← "security_event"
 *   - session_id    ← record.session_id (or random UUID if absent)
 *   - status        ← "blocked"
 *   - error_type    ← record.category
 *   - tool_name     ← "execute_command" (the only entry point that
 *                      produces rejections)
 *   - tool_output_hash ← sha256(record.command).slice(0,16)
 *                      (per schema §5 sensitive data rule)
 *   - data          ← { event_subtype, command_hash, reason, severity,
 *                        caller, shell, category }
 *
 * If the locked schema (7/22) renames fields, only this function needs
 * updating — the file writer is field-agnostic.
 */
export function convertRejectionToDatalog(
  record: RejectionRecord
): DatalogEvent {
  const commandHashValue = commandHash(record.command);
  return {
    ts: record.timestamp,
    member: 'lingxi',
    event_type: 'security_event',
    session_id: record.session_id ?? crypto.randomUUID(),
    status: 'blocked',
    error_type: record.category,
    tool_name: 'execute_command',
    tool_output_hash: commandHashValue,
    data: {
      event_subtype: 'command_rejected',
      category: record.category,
      command_hash: commandHashValue,
      reason: record.reason,
      caller: record.caller,
      shell: record.shell ?? false,
      record_id: record.id,
    },
  };
}

/**
 * Append a rejection record as a datalog event to today's JSONL file.
 *
 * Safety:
 *   - Disabled via LING_DATALOG_ENABLED=0 (default: enabled)
 *   - Errors never propagate to the caller (rejection logging is the
 *     hot path; datalog writes must not block or fail loudly)
 *   - Append + immediate flush: per schema §5 crash-safety rule
 */
export function appendDatalogRecord(record: RejectionRecord): boolean {
  if (!isDatalogEnabled()) return false;
  try {
    ensureDatalogDir();
    const event = convertRejectionToDatalog(record);
    const line = JSON.stringify(event) + '\n';
    fs.appendFileSync(dailyFilePath(new Date(record.timestamp)), line, 'utf8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Read all datalog events for a given date (YYYY-MM-DD).
 * Returns an empty array if the file does not exist.
 */
export function readDatalogForDate(date: string): DatalogEvent[] {
  const filePath = path.join(DATALOG_DIR(), `${date}.jsonl`);
  if (!fs.existsSync(filePath)) return [];
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as DatalogEvent;
        } catch {
          // Skip malformed lines
          return null;
        }
      })
      .filter((e): e is DatalogEvent => e !== null);
  } catch {
    return [];
  }
}

/**
 * Count events for today (convenience for metrics).
 */
export function countTodayEvents(): number {
  return readDatalogForDate(dateStringFor(new Date())).length;
}
