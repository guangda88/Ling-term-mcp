import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  computeFileHash,
  computeInitialHashes,
  detectChange,
  getProtectedPaths,
  _setPathsForTesting,
  _setHashesForTesting,
  _resetForTesting,
} from '../../src/audit/protected_paths.js';
import {
  startFileGuardian,
  stopFileGuardian,
  isRunning,
  getStatus,
  readChangeLog,
} from '../../src/audit/file_guardian.js';

const TMP_DIR = path.join(os.tmpdir(), 'file_guardian_test_' + process.pid);

function setupTmpDir(): void {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
}

function cleanupTmpDir(): void {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
}

function writeTestFile(name: string, content: string): string {
  const filePath = path.join(TMP_DIR, name);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

describe('protected_paths', () => {
  beforeEach(() => {
    _resetForTesting();
    setupTmpDir();
  });

  afterAll(() => {
    cleanupTmpDir();
  });

  test('computeFileHash returns consistent SHA-256', () => {
    const filePath = writeTestFile('hash_test.txt', 'hello world');
    const hash1 = computeFileHash(filePath);
    const hash2 = computeFileHash(filePath);
    expect(hash1).toBeTruthy();
    expect(hash1).toBe(hash2);
    expect(hash1!.length).toBe(64);
  });

  test('computeFileHash returns null for non-existent file', () => {
    const hash = computeFileHash('/nonexistent/file.txt');
    expect(hash).toBeNull();
  });

  test('computeFileHash returns null for directory', () => {
    const hash = computeFileHash(TMP_DIR);
    expect(hash).toBeNull();
  });

  test('computeInitialHashes handles single file', () => {
    const filePath = writeTestFile('single.txt', 'content');
    const hashes = computeInitialHashes([
      {
        path: filePath,
        recursive: false,
        severity: 'high',
        description: 'test',
      },
    ]);
    expect(Object.keys(hashes).length).toBe(1);
    expect(hashes[filePath]).toBeTruthy();
  });

  test('computeInitialHashes handles recursive directory', () => {
    const subDir = path.join(TMP_DIR, 'subdir');
    fs.mkdirSync(subDir, { recursive: true });
    writeTestFile('subdir/a.txt', 'aaa');
    writeTestFile('subdir/b.txt', 'bbb');

    const hashes = computeInitialHashes([
      {
        path: subDir,
        recursive: true,
        severity: 'critical',
        description: 'test dir',
      },
    ]);
    expect(Object.keys(hashes).length).toBe(2);
  });

  test('detectChange returns null when no change', () => {
    const filePath = writeTestFile('no_change.txt', 'stable');
    const hash = computeFileHash(filePath)!;
    _setPathsForTesting([
      {
        path: filePath,
        recursive: false,
        severity: 'high',
        description: 'test',
      },
    ]);
    _setHashesForTesting({ [filePath]: hash });

    const result = detectChange(filePath);
    expect(result).toBeNull();
  });

  test('detectChange detects file modification', () => {
    const filePath = writeTestFile('change.txt', 'original');
    const originalHash = computeFileHash(filePath)!;
    _setPathsForTesting([
      {
        path: filePath,
        recursive: false,
        severity: 'high',
        description: 'test',
      },
    ]);
    _setHashesForTesting({ [filePath]: originalHash });

    fs.writeFileSync(filePath, 'modified', 'utf8');

    const result = detectChange(filePath);
    expect(result).not.toBeNull();
    expect(result!.oldHash).toBe(originalHash);
    expect(result!.newHash).not.toBe(originalHash);
  });

  test('detectChange detects new file', () => {
    const filePath = path.join(TMP_DIR, 'new_file.txt');
    _setPathsForTesting([
      {
        path: filePath,
        recursive: false,
        severity: 'high',
        description: 'test',
      },
    ]);
    _setHashesForTesting({});

    fs.writeFileSync(filePath, 'new content', 'utf8');

    const result = detectChange(filePath);
    expect(result).not.toBeNull();
    expect(result!.oldHash).toBeNull();
    expect(result!.newHash).toBeTruthy();
  });

  test('getProtectedPaths returns default paths', () => {
    _setPathsForTesting([
      {
        path: '/tmp/test',
        recursive: false,
        severity: 'critical',
        description: 'test',
      },
    ]);
    const paths = getProtectedPaths();
    expect(paths.length).toBe(1);
    expect(paths[0].severity).toBe('critical');
  });
});

describe('file_guardian', () => {
  beforeEach(() => {
    _resetForTesting();
    setupTmpDir();
    stopFileGuardian();
  });

  afterAll(() => {
    cleanupTmpDir();
    stopFileGuardian();
  });

  test('startFileGuardian sets running state', () => {
    expect(isRunning()).toBe(false);
    startFileGuardian();
    expect(isRunning()).toBe(true);
    stopFileGuardian();
    expect(isRunning()).toBe(false);
  });

  test('getStatus returns correct info when running', () => {
    startFileGuardian();
    const status = getStatus();
    expect(status.running).toBe(true);
    expect(status.watchedPaths).toBeGreaterThan(0);
    stopFileGuardian();
  });

  test('detects file change via watcher callback', (done) => {
    const filePath = writeTestFile('watch_test.txt', 'initial');
    const hash = computeFileHash(filePath)!;

    _setPathsForTesting([
      {
        path: filePath,
        recursive: false,
        severity: 'high',
        description: 'test file',
      },
    ]);
    _setHashesForTesting({ [filePath]: hash });

    startFileGuardian({
      onAnyChange: (record) => {
        expect(record.filePath).toBe(filePath);
        expect(record.newHash).toBeTruthy();
        stopFileGuardian();
        done();
      },
    });

    setTimeout(() => {
      fs.writeFileSync(filePath, 'changed by watcher', 'utf8');
    }, 300);
  }, 10000);

  test('readChangeLog returns empty for non-existent log', () => {
    stopFileGuardian();
    const log = readChangeLog();
    expect(Array.isArray(log)).toBe(true);
  });

  test('stopFileGuardian is idempotent', () => {
    stopFileGuardian();
    stopFileGuardian();
    expect(isRunning()).toBe(false);
  });
});
