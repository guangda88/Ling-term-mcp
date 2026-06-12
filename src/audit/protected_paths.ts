import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ProtectedPath {
  path: string;
  recursive: boolean;
  severity: 'critical' | 'high' | 'medium';
  description: string;
}

const DEFAULT_PATHS: ProtectedPath[] = [
  {
    path: '/home/ai/.ling_lib/',
    recursive: true,
    severity: 'critical',
    description: '全族共享基础设施库',
  },
  {
    path: '/home/ai/.ling_keys.env',
    recursive: false,
    severity: 'critical',
    description: '全族API密钥',
  },
  {
    path: '/home/ai/.lingflow-plus/api_keys.json',
    recursive: false,
    severity: 'critical',
    description: 'Proxy API密钥配置',
  },
  {
    path: '/home/ai/.lingflow-plus/proxy_config.json',
    recursive: false,
    severity: 'high',
    description: 'Proxy路由配置',
  },
  {
    path: '/home/ai/.lingflow-plus/models.json',
    recursive: false,
    severity: 'high',
    description: 'Proxy模型配置',
  },
  {
    path: '/home/ai/llm-proxy/proxy_config.json',
    recursive: false,
    severity: 'high',
    description: 'LLM Proxy配置',
  },
  {
    path: '/home/ai/lingxi/CRUSH.md',
    recursive: false,
    severity: 'high',
    description: '灵犀身份锚定文件',
  },
  {
    path: '/home/ai/lingxi/AGENTS.md',
    recursive: false,
    severity: 'high',
    description: '灵犀代理指南',
  },
  {
    path: '/home/ai/lingflow/CRUSH.md',
    recursive: false,
    severity: 'high',
    description: '灵通身份锚定文件',
  },
];

const BASE_DIR =
  process.env.LING_TERM_BASEDIR || path.join(os.homedir(), '.ling-term-mcp');
const HASHES_FILE = path.join(BASE_DIR, 'file_hashes.json');
const CUSTOM_PATHS_FILE = path.join(BASE_DIR, 'protected_paths.json');

let protectedPaths: ProtectedPath[] = [];
let storedHashes: Record<string, string> = {};

export function getProtectedPaths(): ProtectedPath[] {
  return [...protectedPaths];
}

export function computeFileHash(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) return null;
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return null;
  }
}

function computeDirHash(dirPath: string): Record<string, string> {
  const hashes: Record<string, string> = {};
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const sub = computeDirHash(fullPath);
        Object.assign(hashes, sub);
      } else if (entry.isFile()) {
        const h = computeFileHash(fullPath);
        if (h) hashes[fullPath] = h;
      }
    }
  } catch {
    // directory may not exist
  }
  return hashes;
}

export function computeInitialHashes(
  paths: ProtectedPath[]
): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const pp of paths) {
    if (pp.recursive) {
      const dirHashes = computeDirHash(pp.path);
      Object.assign(hashes, dirHashes);
    } else {
      const h = computeFileHash(pp.path);
      if (h) hashes[pp.path] = h;
    }
  }
  return hashes;
}

export function loadHashes(): Record<string, string> {
  try {
    if (fs.existsSync(HASHES_FILE)) {
      const data = fs.readFileSync(HASHES_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch {
    // ignore
  }
  return {};
}

export function saveHashes(hashes: Record<string, string>): void {
  try {
    if (!fs.existsSync(BASE_DIR)) {
      fs.mkdirSync(BASE_DIR, { recursive: true });
    }
    fs.writeFileSync(HASHES_FILE, JSON.stringify(hashes, null, 2), 'utf8');
  } catch (e) {
    console.error('[file_guardian] Failed to save hashes:', e);
  }
}

function loadCustomPaths(): ProtectedPath[] {
  try {
    if (fs.existsSync(CUSTOM_PATHS_FILE)) {
      const data = fs.readFileSync(CUSTOM_PATHS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch {
    // ignore
  }
  return [];
}

export function initializePaths(): void {
  const custom = loadCustomPaths();
  protectedPaths = [...DEFAULT_PATHS, ...custom];
}

export function initialize(): void {
  initializePaths();
  storedHashes = loadHashes();

  const currentHashes = computeInitialHashes(protectedPaths);

  const newEntries = Object.keys(currentHashes).filter((k) => !storedHashes[k]);
  for (const k of newEntries) {
    storedHashes[k] = currentHashes[k];
  }

  const staleKeys = Object.keys(storedHashes).filter((k) => !currentHashes[k]);
  for (const k of staleKeys) {
    delete storedHashes[k];
  }

  saveHashes(storedHashes);
  console.error(
    `[file_guardian] Initialized with ${protectedPaths.length} paths, ${Object.keys(storedHashes).length} hashes tracked`
  );
}

export function detectChange(
  filePath: string
): { oldHash: string | null; newHash: string; severity: string } | null {
  const newHash = computeFileHash(filePath);
  if (!newHash) return null;

  const oldHash = storedHashes[filePath] || null;
  if (oldHash === newHash) return null;

  const pp = protectedPaths.find((p) => {
    if (p.recursive) {
      return filePath.startsWith(p.path);
    }
    return filePath === p.path;
  });

  const severity = pp?.severity || 'medium';

  storedHashes[filePath] = newHash;
  saveHashes(storedHashes);

  return { oldHash, newHash, severity };
}

export interface FileChangeRecord {
  id: string;
  timestamp: string;
  filePath: string;
  oldHash: string | null;
  newHash: string;
  severity: string;
}

export function formatChangeRecord(
  filePath: string,
  oldHash: string | null,
  newHash: string,
  severity: string
): FileChangeRecord {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    filePath,
    oldHash,
    newHash,
    severity,
  };
}

export function getHashes(): Record<string, string> {
  return { ...storedHashes };
}

export function _setPathsForTesting(paths: ProtectedPath[]): void {
  protectedPaths = paths;
}

export function _setHashesForTesting(hashes: Record<string, string>): void {
  storedHashes = hashes;
}

export function _resetForTesting(): void {
  protectedPaths = [];
  storedHashes = {};
}
