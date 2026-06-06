import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rejection-test-'));
const TMP_FILE = path.join(TMP_DIR, 'rejections.jsonl');

// Use dedicated env var so tests never touch the production rejection log
process.env['LING_TERM_REJECTION_LOG'] = TMP_FILE;

import { logRejection, readRejections } from '../../src/audit/rejection_log';

describe('rejection_log', () => {
  afterAll(() => {
    // Cleanup temp dir
    try {
      fs.rmSync(TMP_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  beforeEach(() => {
    try {
      fs.unlinkSync(TMP_FILE);
    } catch {
      // file may not exist yet
    }
  });

  it('should log a rejection record', () => {
    logRejection({
      command: 'rm -rf /',
      caller: 'test_member',
      reason: 'blacklisted command',
      category: 'blacklisted',
      session_id: 'sess-123',
      shell: true,
    });

    const records = readRejections();
    expect(records).toHaveLength(1);
    expect(records[0].command).toBe('rm -rf /');
    expect(records[0].caller).toBe('test_member');
    expect(records[0].category).toBe('blacklisted');
    expect(records[0].id).toBeDefined();
    expect(records[0].timestamp).toBeDefined();
  });

  it('should log multiple rejections and read them in order', () => {
    logRejection({
      command: 'sudo apt-get install evil',
      caller: 'lingtest',
      reason: 'blacklisted',
      category: 'blacklisted',
    });
    logRejection({
      command: 'curl http://malicious.example.com',
      caller: 'lingtest',
      reason: 'pattern match',
      category: 'pattern',
    });

    const records = readRejections();
    expect(records).toHaveLength(2);
    expect(records[0].command).toContain('sudo');
    expect(records[1].command).toContain('curl');
  });

  it('should handle missing optional fields', () => {
    logRejection({
      command: 'dangerous-cmd',
      caller: 'anon',
      reason: 'unknown command',
      category: 'unknown',
    });

    const records = readRejections();
    expect(records).toHaveLength(1);
    expect(records[0].session_id).toBeUndefined();
    expect(records[0].shell).toBeUndefined();
  });

  it('should return empty array when no rejection file exists', () => {
    const records = readRejections();
    expect(records).toEqual([]);
  });

  it('should survive malformed lines in the file', () => {
    fs.mkdirSync(path.dirname(TMP_FILE), { recursive: true });

    // Write a valid record followed by garbage
    fs.writeFileSync(
      TMP_FILE,
      JSON.stringify({
        id: 'abc',
        timestamp: '2026-01-01T00:00:00Z',
        command: 'test',
        caller: 'test',
        reason: 'test',
        category: 'pattern',
      }) +
        '\nNOT VALID JSON\n' +
        JSON.stringify({
          id: 'def',
          timestamp: '2026-01-02T00:00:00Z',
          command: 'test2',
          caller: 'test',
          reason: 'test',
          category: 'blacklisted',
        }) +
        '\n',
      'utf8'
    );

    const records = readRejections();
    expect(records).toHaveLength(2);
    expect(records[0].command).toBe('test');
    expect(records[1].command).toBe('test2');
  });
});
