/**
 * Backend Subprocess Manager
 *
 * Spawns and manages stdio MCP server child processes.
 * Lazy-start: backends spawn on first call, not at startup.
 * Auto-restart: crashed backends restart on next call.
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface BackendConfig {
  command: string;
  args: string[];
  cwd: string;
  description: string;
  env?: Record<string, string>;
}

export interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface BackendState {
  config: BackendConfig;
  process: ChildProcess | null;
  initialized: boolean;
  lastError: string | null;
  lastUsed: number | null;
  restartCount: number;
  pendingRequests: Map<string | number, PendingRequest>;
  buffer: string;
}

const INIT_TIMEOUT_MS = 15_000;
const CALL_TIMEOUT_MS = 120_000;
const MAX_RESTARTS = 5;

let backendsPath: string | null = null;

export function setBackendsPath(p: string): void {
  backendsPath = p;
}

export function getDefaultBackendsPath(): string {
  if (backendsPath) return backendsPath;
  const candidates = [
    path.join(process.cwd(), 'backends.json'),
    path.join(__dirname, '..', '..', 'backends.json'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

export function loadBackends(
  configPath?: string
): Record<string, BackendConfig> {
  const resolvedPath = configPath || getDefaultBackendsPath();
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Backends config not found: ${resolvedPath}`);
  }
  const raw = fs.readFileSync(resolvedPath, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!parsed.backends || typeof parsed.backends !== 'object') {
    throw new Error('Invalid backends.json: missing "backends" object');
  }
  return parsed.backends as Record<string, BackendConfig>;
}

const backendStates = new Map<string, BackendState>();

function createState(config: BackendConfig): BackendState {
  return {
    config,
    process: null,
    initialized: false,
    lastError: null,
    lastUsed: null,
    restartCount: 0,
    pendingRequests: new Map(),
    buffer: '',
  };
}

/**
 * Ensure a backend is running. Spawns if not started.
 */
export function ensureBackend(name: string): BackendState {
  let state = backendStates.get(name);
  if (!state) {
    const configs = loadBackends();
    const config = configs[name];
    if (!config) {
      throw new Error(`Unknown backend: '${name}'`);
    }
    state = createState(config);
    backendStates.set(name, state);
  }

  // If process is alive (even if not yet initialized), reuse it.
  // Don't kill a spawning process just because initialized=false.
  if (state.process && !state.process.killed) {
    return state;
  }

  spawnBackend(name, state);
  return state;
}

function killProcess(state: BackendState): void {
  if (!state.process) return;
  try {
    state.process.kill('SIGTERM');
  } catch {
    // already dead
  }
  state.process = null;
  state.initialized = false;
}

function spawnBackend(name: string, state: BackendState): void {
  const { command, args, cwd, env } = state.config;

  const childEnv = { ...process.env, ...env };

  const child = spawn(command, args, {
    cwd,
    env: childEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  state.process = child;
  state.buffer = '';
  state.lastError = null;

  child.stdout?.setEncoding('utf-8');
  child.stdout?.on('data', (data: string) => {
    state.buffer += data;
    drainMessages(name, state);
  });

  child.stderr?.setEncoding('utf-8');
  child.stderr?.on('data', (data: string) => {
    // MCP servers use stderr for logging
    const lines = data.trim();
    if (lines) {
      console.error(`[proxy:${name}] ${lines}`);
    }
  });

  child.on('exit', (code, signal) => {
    const reason = signal ? `signal ${signal}` : `code ${code}`;
    console.error(`[proxy:${name}] Process exited (${reason})`);

    // Reject all pending requests
    for (const [, req] of state.pendingRequests) {
      clearTimeout(req.timer);
      req.reject(new Error(`Backend '${name}' exited (${reason})`));
    }
    state.pendingRequests.clear();

    state.process = null;
    state.initialized = false;
    state.lastError = `Process exited (${reason})`;

    // Track restart attempts for unexpected exits
    if (code !== 0 && state.restartCount < MAX_RESTARTS) {
      state.restartCount++;
    }
  });

  child.on('error', (err) => {
    console.error(`[proxy:${name}] Spawn error:`, err.message);
    state.lastError = err.message;
    state.process = null;
    state.initialized = false;
  });
}

interface JsonRpcMessage {
  jsonrpc: string;
  id?: string | number;
  method?: string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
  params?: unknown;
}

function drainMessages(name: string, state: BackendState): void {
  // JSON-RPC messages are newline-delimited
  const lines = state.buffer.split('\n');
  state.buffer = lines.pop() || '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let msg: JsonRpcMessage;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      console.error(
        `[proxy:${name}] Unparseable message: ${trimmed.slice(0, 200)}`
      );
      continue;
    }
    handleMessage(name, state, msg);
  }
}

function handleMessage(
  name: string,
  state: BackendState,
  msg: JsonRpcMessage
): void {
  if (msg.id !== undefined && (msg.result !== undefined || msg.error)) {
    // Response to a pending request
    const pending = state.pendingRequests.get(msg.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    state.pendingRequests.delete(msg.id);

    if (msg.error) {
      pending.reject(
        new Error(`[${name}] ${msg.error.message} (code ${msg.error.code})`)
      );
    } else {
      pending.resolve(msg.result);
    }
    return;
  }

  // Could be a notification or server-initiated request — ignore for now
}

let nextRequestId = 1;

/**
 * Send a JSON-RPC request to a backend and await the response.
 */
export async function callBackend(
  name: string,
  method: string,
  params?: unknown
): Promise<unknown> {
  const state = ensureBackend(name);
  if (!state.process || !state.process.stdin) {
    throw new Error(`Backend '${name}' is not running`);
  }

  const id = nextRequestId++;
  const message = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      state.pendingRequests.delete(id);
      reject(
        new Error(
          `[${name}] Request '${method}' timed out after ${CALL_TIMEOUT_MS}ms`
        )
      );
    }, CALL_TIMEOUT_MS);

    state.pendingRequests.set(id, { resolve, reject, timer });

    const proc = state.process;
    if (!proc || !proc.stdin) {
      clearTimeout(timer);
      state.pendingRequests.delete(id);
      reject(new Error(`[${name}] Backend stdin not available`));
      return;
    }
    proc.stdin.write(message, (err) => {
      if (err) {
        clearTimeout(timer);
        state.pendingRequests.delete(id);
        reject(new Error(`[${name}] Failed to write to stdin: ${err.message}`));
      }
    });

    state.lastUsed = Date.now();
  });
}

/**
 * Initialize a backend (send MCP initialize handshake).
 */
export async function initializeBackend(name: string): Promise<boolean> {
  const state = ensureBackend(name);
  if (state.initialized) return true;

  try {
    const result = (await Promise.race([
      callBackend(name, 'initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'lingxi-proxy', version: '1.0.0' },
      }),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`[${name}] Init timeout`)),
          INIT_TIMEOUT_MS
        )
      ),
    ])) as Record<string, unknown>;

    // Send initialized notification
    if (state.process && state.process.stdin) {
      state.process.stdin.write(
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/initialized',
        }) + '\n'
      );
    }

    state.initialized = true;
    state.restartCount = 0;
    console.error(
      `[proxy:${name}] Initialized: ${JSON.stringify(result.serverInfo || result)}`
    );
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    state.lastError = msg;
    console.error(`[proxy:${name}] Init failed: ${msg}`);
    return false;
  }
}

/**
 * List tools from a backend (with lazy init).
 */
export async function listBackendTools(
  name: string
): Promise<Array<{ name: string; description?: string }>> {
  const ok = await initializeBackend(name);
  if (!ok) {
    throw new Error(
      `Backend '${name}' failed to initialize: ${getBackendError(name)}`
    );
  }
  const result = (await callBackend(name, 'tools/list', {})) as {
    tools: Array<{ name: string; description?: string }>;
  };
  return result.tools || [];
}

/**
 * Call a specific tool on a backend.
 */
export async function callBackendTool(
  name: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const ok = await initializeBackend(name);
  if (!ok) {
    throw new Error(`Backend '${name}' failed to initialize`);
  }
  return callBackend(name, 'tools/call', { name: toolName, arguments: args });
}

/**
 * Get the list of configured backend names.
 */
export function getBackendNames(): string[] {
  try {
    const configs = loadBackends();
    return Object.keys(configs);
  } catch {
    return [];
  }
}

/**
 * Get error message for a backend.
 */
export function getBackendError(name: string): string | null {
  const state = backendStates.get(name);
  return state?.lastError ?? null;
}

/**
 * Get status of a backend.
 */
export function getBackendStatus(name: string): {
  name: string;
  description: string;
  running: boolean;
  initialized: boolean;
  last_error: string | null;
  last_used: string | null;
  restart_count: number;
  pending_requests: number;
} {
  const configs = loadBackends();
  const config = configs[name];
  const state = backendStates.get(name);

  return {
    name,
    description: config?.description || '',
    running: !!(state?.process && !state.process.killed),
    initialized: state?.initialized ?? false,
    last_error: state?.lastError ?? null,
    last_used: state?.lastUsed ? new Date(state.lastUsed).toISOString() : null,
    restart_count: state?.restartCount ?? 0,
    pending_requests: state?.pendingRequests.size ?? 0,
  };
}

/**
 * Get status of all backends.
 */
export function getAllBackendStatuses(): ReturnType<typeof getBackendStatus>[] {
  return getBackendNames().map((name) => getBackendStatus(name));
}

/**
 * Gracefully shut down all backends.
 */
export function shutdownAll(): void {
  for (const [name, state] of backendStates) {
    if (state.process) {
      console.error(`[proxy:${name}] Shutting down...`);
      killProcess(state);
    }
  }
  backendStates.clear();
}

export function _resetForTesting(): void {
  for (const [, state] of backendStates) {
    killProcess(state);
  }
  backendStates.clear();
  nextRequestId = 1;
}
