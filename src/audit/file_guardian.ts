import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  initialize,
  detectChange,
  formatChangeRecord,
  getProtectedPaths,
  type FileChangeRecord,
} from './protected_paths.js';

const BASE_DIR =
  process.env.LING_TERM_BASEDIR || path.join(os.homedir(), '.ling-term-mcp');
const CHANGE_LOG_FILE = path.join(BASE_DIR, 'file_changes.jsonl');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB
const POLL_INTERVAL_MS = 2000; // 2秒轮询一次

interface GuardianConfig {
  onCriticalChange?: (record: FileChangeRecord) => void;
  onHighChange?: (record: FileChangeRecord) => void;
  onAnyChange?: (record: FileChangeRecord) => void;
}

let pollTimer: ReturnType<typeof setTimeout> | null = null;
let running = false;
const debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
const DEBOUNCE_MS = 500;

function appendChangeLog(record: FileChangeRecord): void {
  try {
    if (!fs.existsSync(BASE_DIR)) {
      fs.mkdirSync(BASE_DIR, { recursive: true });
    }
    if (fs.existsSync(CHANGE_LOG_FILE)) {
      const stat = fs.statSync(CHANGE_LOG_FILE);
      if (stat.size > MAX_LOG_SIZE) {
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const archive = path.join(BASE_DIR, `file_changes_${ts}.jsonl`);
        fs.renameSync(CHANGE_LOG_FILE, archive);
      }
    }
    fs.appendFileSync(CHANGE_LOG_FILE, JSON.stringify(record) + '\n', 'utf8');
  } catch (e) {
    console.error('[file_guardian] Failed to append change log:', e);
  }
}

function scanDirectory(dirPath: string, config: GuardianConfig): void {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        // 递归扫描子目录
        scanDirectory(fullPath, config);
      } else {
        handleFileEvent(null, fullPath, config);
      }
    }
  } catch (e) {
    console.error(`[file_guardian] Error scanning ${dirPath}:`, e);
  }
}

function handleFileEvent(
  _eventType: string | null,
  filePath: string,
  config: GuardianConfig
): void {
  const existing = debounceTimers.get(filePath);
  if (existing) {
    clearTimeout(existing);
  }

  const timer = setTimeout(() => {
    debounceTimers.delete(filePath);

    if (!fs.existsSync(filePath)) return;
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) return;

    const result = detectChange(filePath);
    if (!result) return;

    const record = formatChangeRecord(
      filePath,
      result.oldHash,
      result.newHash,
      result.severity
    );

    appendChangeLog(record);

    const severityLabel =
      record.severity === 'critical'
        ? '🔴 CRITICAL'
        : record.severity === 'high'
          ? '🟡 HIGH'
          : '🟢 MEDIUM';

    console.error(
      `[file_guardian] ${severityLabel} file change detected: ${filePath} (${result.oldHash ? 'modified' : 'new'})`
    );

    if (config.onAnyChange) {
      config.onAnyChange(record);
    }

    if (record.severity === 'critical' && config.onCriticalChange) {
      config.onCriticalChange(record);
    }

    if (record.severity === 'high' && config.onHighChange) {
      config.onHighChange(record);
    }
  }, DEBOUNCE_MS);

  debounceTimers.set(filePath, timer);
}

function pollPaths(config: GuardianConfig): void {
  const paths = getProtectedPaths();
  let scanned = 0;

  for (const pp of paths) {
    const watchDir = pp.recursive ? pp.path : path.dirname(pp.path);

    if (!fs.existsSync(watchDir)) {
      console.error(
        `[file_guardian] Path does not exist, skipping: ${watchDir}`
      );
      continue;
    }

    try {
      if (pp.recursive) {
        scanDirectory(watchDir, config);
      } else {
        handleFileEvent(null, pp.path, config);
      }
      scanned++;
    } catch (e) {
      console.error(`[file_guardian] Failed to scan ${watchDir}:`, e);
    }
  }

  console.error(
    `[file_guardian] Poll scan completed: ${scanned}/${paths.length} paths checked`
  );
}

export function startFileGuardian(config: GuardianConfig = {}): void {
  if (running) {
    console.error('[file_guardian] Already running');
    return;
  }

  const currentPaths = getProtectedPaths();
  if (currentPaths.length === 0) {
    initialize();
  }
  running = true;

  // 初始扫描
  pollPaths(config);

  // 设置定时器轮询
  pollTimer = setInterval(() => {
    pollPaths(config);
  }, POLL_INTERVAL_MS);

  console.error('[file_guardian] Started polling mode');
}

export function stopFileGuardian(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  for (const timer of debounceTimers.values()) {
    clearTimeout(timer);
  }
  debounceTimers.clear();

  running = false;
  console.error('[file_guardian] Stopped');
}

export function isRunning(): boolean {
  return running;
}

export function getStatus(): {
  running: boolean;
  watchedPaths: number;
  activeWatchers: number;
} {
  return {
    running,
    watchedPaths: getProtectedPaths().length,
    activeWatchers: 0, // polling mode, no FSWatcher instances
  };
}

export function readChangeLog(limit: number = 50): FileChangeRecord[] {
  try {
    if (!fs.existsSync(CHANGE_LOG_FILE)) return [];
    const data = fs.readFileSync(CHANGE_LOG_FILE, 'utf8');
    const lines = data
      .split('\n')
      .filter((l) => l.trim())
      .slice(-limit);
    return lines.map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

export { initialize } from './protected_paths.js';
export type { FileChangeRecord, ProtectedPath } from './protected_paths.js';
