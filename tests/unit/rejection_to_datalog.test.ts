/**
 * Unit tests for rejection_to_datalog.ts (P1.3 / P1.4)
 *
 * Coverage:
 *  - Field mapping (P0.8 schema v1 compliance)
 *  - Daily file rotation (YYYY-MM-DD.jsonl)
 *  - Toggle off via LING_DATALOG_ENABLED=0
 *  - Sensitive data: command is hashed, never stored raw
 *  - Failure isolation: errors must not throw
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import {
  convertRejectionToDatalog,
  appendDatalogRecord,
  readDatalogForDate,
  countTodayEvents,
} from '../../src/audit/rejection_to_datalog.js';
import type { RejectionRecord } from '../../src/audit/rejection_log.js';

const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'lingxi-datalog-test-'));

function makeRecord(overrides: Partial<RejectionRecord> = {}): RejectionRecord {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date('2026-07-19T10:30:00.000Z').toISOString(),
    command: 'rm -rf /etc/sensitive',
    caller: 'lingflow',
    reason: 'sensitive path detected',
    category: 'sensitive_path',
    session_id: 'test-session-001',
    shell: false,
    ...overrides,
  };
}

describe('rejection_to_datalog — L6 stub', () => {
  beforeAll(() => {
    process.env['LING_DATALOG_DIR'] = path.join(TMP_ROOT, 'datalog');
    process.env['LING_DATALOG_ENABLED'] = '1';
  });

  afterEach(() => {
    // Wipe and recreate datalog dir for test isolation
    const dir = process.env['LING_DATALOG_DIR']!;
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    fs.mkdirSync(dir, { recursive: true });
  });

  describe('convertRejectionToDatalog — field mapping', () => {
    test('maps to P0.8 schema v1 required fields', () => {
      const record = makeRecord();
      const event = convertRejectionToDatalog(record);

      expect(event.ts).toBe(record.timestamp);
      expect(event.member).toBe('lingxi');
      expect(event.event_type).toBe('security_event');
      expect(event.session_id).toBe('test-session-001');
      expect(event.status).toBe('blocked');
    });

    test('preserves category as error_type', () => {
      const record = makeRecord({ category: 'red_zone' });
      const event = convertRejectionToDatalog(record);
      expect(event.error_type).toBe('red_zone');
    });

    test('hashes command — never stores raw', () => {
      const secret = 'curl -H "Authorization: Bearer [REDACTED]" /secrets';
      const record = makeRecord({ command: secret });
      const event = convertRejectionToDatalog(record);

      const serialized = JSON.stringify(event);
      expect(serialized).not.toContain('Bearer');
      expect(serialized).not.toContain('curl');
      expect(serialized).not.toContain('Authorization');
      expect(event.tool_output_hash).toHaveLength(16);
      expect(event.data['command_hash']).toHaveLength(16);
    });

    test('generates session_id when missing', () => {
      const record = makeRecord({ session_id: undefined });
      const event = convertRejectionToDatalog(record);
      expect(event.session_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    test('includes all caller metadata in data', () => {
      const record = makeRecord({
        caller: 'lingyang',
        reason: 'eval() detected',
        shell: true,
      });
      const event = convertRejectionToDatalog(record);
      expect(event.data['caller']).toBe('lingyang');
      expect(event.data['reason']).toBe('eval() detected');
      expect(event.data['shell']).toBe(true);
      expect(event.data['category']).toBe('sensitive_path');
      expect(event.data['event_subtype']).toBe('command_rejected');
    });
  });

  describe('appendDatalogRecord — daily JSONL output', () => {
    test('writes to YYYY-MM-DD.jsonl', () => {
      const record = makeRecord();
      const written = appendDatalogRecord(record);
      expect(written).toBe(true);

      const expectedDate = record.timestamp.slice(0, 10);
      const expectedPath = path.join(
        process.env['LING_DATALOG_DIR']!,
        `${expectedDate}.jsonl`
      );
      expect(fs.existsSync(expectedPath)).toBe(true);

      const content = fs.readFileSync(expectedPath, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0]);
      expect(parsed.event_type).toBe('security_event');
    });

    test('appends, does not overwrite (multiple records)', () => {
      const r1 = makeRecord({ id: 'rec-001' });
      const r2 = makeRecord({ id: 'rec-002' });
      const r3 = makeRecord({ id: 'rec-003' });

      appendDatalogRecord(r1);
      appendDatalogRecord(r2);
      appendDatalogRecord(r3);

      const events = readDatalogForDate('2026-07-19');
      expect(events).toHaveLength(3);
      expect(events.map((e) => e.data['record_id'])).toEqual([
        'rec-001',
        'rec-002',
        'rec-003',
      ]);
    });

    test('respects LING_DATALOG_ENABLED=0 toggle', () => {
      const original = process.env['LING_DATALOG_ENABLED'];
      process.env['LING_DATALOG_ENABLED'] = '0';

      const written = appendDatalogRecord(makeRecord());
      expect(written).toBe(false);

      const events = readDatalogForDate('2026-07-19');
      expect(events).toHaveLength(0);

      process.env['LING_DATALOG_ENABLED'] = original ?? '1';
    });
  });

  describe('readDatalogForDate + countTodayEvents', () => {
    test('returns empty array for missing date', () => {
      const events = readDatalogForDate('1999-01-01');
      expect(events).toEqual([]);
    });

    test('skips malformed lines gracefully', () => {
      const dir = process.env['LING_DATALOG_DIR']!;
      const fp = path.join(dir, '2026-07-19.jsonl');
      fs.writeFileSync(
        fp,
        '{"ts":"2026-07-19T10:00:00Z","member":"lingxi"}\n' +
          'not-valid-json\n' +
          '{"ts":"2026-07-19T10:01:00Z","member":"lingxi"}\n',
        'utf8'
      );

      expect(fs.existsSync(fp)).toBe(true);

      const events = readDatalogForDate('2026-07-19');
      expect(events).toHaveLength(2);
    });

    test('countTodayEvents reflects current date file', () => {
      const today = new Date().toISOString().slice(0, 10);
      appendDatalogRecord(makeRecord({ timestamp: new Date().toISOString() }));
      appendDatalogRecord(makeRecord({ timestamp: new Date().toISOString() }));
      expect(countTodayEvents()).toBe(2);

      // Different date returns 0
      expect(readDatalogForDate('1999-12-31')).toEqual([]);
      // Suppress unused var warning
      void today;
    });
  });
});
