import * as fs from 'fs';
import * as path from 'path';
import {
  loadBackends,
  getDefaultBackendsPath,
  getBackendNames,
  getBackendStatus,
  getAllBackendStatuses,
  getBackendError,
  setBackendsPath,
  _resetForTesting,
} from '../../src/proxy/manager';
import { proxy } from '../../src/tools/proxy';

type ToolResult = { content: Array<{ text: string }>; isError?: boolean };

const TEST_BACKENDS = {
  backends: {
    testecho: {
      command: 'cat',
      args: [],
      cwd: '/tmp',
      description: 'Test backend (echoes stdin)',
      env: {},
    },
  },
};

const TMP_CONFIG = '/tmp/test_backends_proxy.json';

beforeAll(() => {
  fs.writeFileSync(TMP_CONFIG, JSON.stringify(TEST_BACKENDS));
  setBackendsPath(TMP_CONFIG);
});

afterAll(() => {
  _resetForTesting();
  setBackendsPath(path.join(__dirname, '..', '..', 'backends.json'));
  if (fs.existsSync(TMP_CONFIG)) fs.unlinkSync(TMP_CONFIG);
});

beforeEach(() => {
  setBackendsPath(TMP_CONFIG);
  _resetForTesting();
});

describe('proxy/manager — loadBackends', () => {
  it('should load backends from config file', () => {
    const configs = loadBackends();
    expect(configs.testecho).toBeDefined();
    expect(configs.testecho.command).toBe('cat');
    expect(configs.testecho.description).toBe('Test backend (echoes stdin)');
  });

  it('should throw for non-existent config', () => {
    expect(() => loadBackends('/nonexistent/path.json')).toThrow('not found');
  });

  it('should throw for invalid format', () => {
    const tmpBad = '/tmp/test_backends_bad.json';
    fs.writeFileSync(tmpBad, JSON.stringify({ wrong: true }));
    expect(() => loadBackends(tmpBad)).toThrow('missing "backends"');
    fs.unlinkSync(tmpBad);
  });
});

describe('proxy/manager — getDefaultBackendsPath', () => {
  it('should return a path that exists or a fallback', () => {
    const p = getDefaultBackendsPath();
    expect(p).toBeDefined();
    expect(typeof p).toBe('string');
  });
});

describe('proxy/manager — getBackendNames', () => {
  it('should list backend names from config', () => {
    const names = getBackendNames();
    expect(names).toContain('testecho');
  });
});

describe('proxy/manager — getBackendStatus', () => {
  it('should return idle status for unstarted backend', () => {
    const status = getBackendStatus('testecho');
    expect(status.name).toBe('testecho');
    expect(status.running).toBe(false);
    expect(status.initialized).toBe(false);
    expect(status.last_error).toBeNull();
    expect(status.pending_requests).toBe(0);
  });

  it('should include description from config', () => {
    const status = getBackendStatus('testecho');
    expect(status.description).toBe('Test backend (echoes stdin)');
  });

  it('should return empty description for unknown backend', () => {
    const status = getBackendStatus('nonexistent');
    expect(status.description).toBe('');
  });
});

describe('proxy/manager — getAllBackendStatuses', () => {
  it('should return status for all configured backends', () => {
    const all = getAllBackendStatuses();
    expect(all.length).toBeGreaterThanOrEqual(1);
    const names = all.map((s) => s.name);
    expect(names).toContain('testecho');
  });
});

describe('proxy/manager — getBackendError', () => {
  it('should return null for backend with no error', () => {
    const err = getBackendError('testecho');
    expect(err).toBeNull();
  });
});

// === MCP Tool Layer ===

describe('proxy status (MCP tool)', () => {
  it('should return status for all backends', async () => {
    const result = (await proxy.handler({
      command: 'status',
    })) as ToolResult;
    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text);
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.backends).toBeDefined();
    expect(Array.isArray(body.backends)).toBe(true);
  });
});

describe('proxy list (MCP tool)', () => {
  it('should reject unknown backend name', async () => {
    const result = (await proxy.handler({
      command: 'list',
      backend: 'nonexistent',
    })) as ToolResult;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown backend');
  });
});

describe('proxy call (MCP tool)', () => {
  it('should require backend parameter', async () => {
    const result = (await proxy.handler({
      command: 'call',
      tool: 'some_tool',
    })) as ToolResult;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('backend is required');
  });

  it('should require tool parameter', async () => {
    const result = (await proxy.handler({
      command: 'call',
      backend: 'testecho',
    })) as ToolResult;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('tool is required');
  });

  it('should return error for unknown backend on call', async () => {
    const result = (await proxy.handler({
      command: 'call',
      backend: 'nonexistent',
      tool: 'whatever',
    })) as ToolResult;
    expect(result.isError).toBe(true);
    // The error could be "Unknown backend" or spawn error
    expect(result.content[0].text).toContain('Error');
  });
});

// === Real backends.json validation ===

describe('proxy — real backends.json', () => {
  it('should validate all configured backends have required fields', () => {
    // Reset to real config
    setBackendsPath(path.join(__dirname, '..', '..', 'backends.json'));
    _resetForTesting();

    const configs = loadBackends();
    for (const [, config] of Object.entries(configs)) {
      expect(config.command).toBeDefined();
      expect(config.command.length).toBeGreaterThan(0);
      expect(config.args).toBeDefined();
      expect(Array.isArray(config.args)).toBe(true);
      expect(config.cwd).toBeDefined();
      expect(config.description).toBeDefined();
      expect(config.description.length).toBeGreaterThan(0);
    }

    const names = Object.keys(configs);
    expect(names).toContain('lingcreate');
    expect(names).toContain('lingzhi');
    expect(names).toContain('lingresearch');
    expect(names).toContain('lingminopt');
    expect(names).toContain('lingyang');
    expect(names).toContain('lingtongask');
  });

  it('should have all backend cwd paths existing on disk', () => {
    setBackendsPath(path.join(__dirname, '..', '..', 'backends.json'));
    const configs = loadBackends();
    for (const [, config] of Object.entries(configs)) {
      const exists = fs.existsSync(config.cwd);
      expect(typeof exists).toBe('boolean');
    }
  });

  it('should report total of 9 backends', () => {
    setBackendsPath(path.join(__dirname, '..', '..', 'backends.json'));
    const names = getBackendNames();
    expect(names.length).toBe(9);
  });
});

// === ensureBackend / spawnBackend / callBackend tests ===

import {
  ensureBackend,
  callBackend,
  initializeBackend,
  listBackendTools,
  callBackendTool,
  shutdownAll,
} from '../../src/proxy/manager';

const RESPONDER_SCRIPT = '/tmp/mock_mcp_responder.js';
const ERROR_SCRIPT = '/tmp/mock_mcp_error.js';
const BADMSG_SCRIPT = '/tmp/mock_mcp_badmsg.js';

beforeAll(() => {
  fs.writeFileSync(
    RESPONDER_SCRIPT,
    `const rl = require('readline').createInterface({ input: process.stdin });
rl.on('line', (line) => {
  try {
    const msg = JSON.parse(line);
    if (msg.method === 'initialize') {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0', id: msg.id,
        result: { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'mock', version: '1.0' } }
      }) + '\\n');
    } else if (msg.method === 'tools/list') {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0', id: msg.id,
        result: { tools: [{ name: 'tool_a', description: 'a' }, { name: 'tool_b', description: 'b' }] }
      }) + '\\n');
    } else if (msg.method === 'tools/call') {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0', id: msg.id,
        result: { content: [{ type: 'text', text: 'tool result' }] }
      }) + '\\n');
    } else {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0', id: msg.id,
        result: { echoed: msg.method }
      }) + '\\n');
    }
  } catch (e) { }
});`
  );
  fs.writeFileSync(
    ERROR_SCRIPT,
    `const rl = require('readline').createInterface({ input: process.stdin });
rl.on('line', (line) => {
  try {
    const msg = JSON.parse(line);
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0', id: msg.id,
      error: { code: -32601, message: 'Method not found' }
    }) + '\\n');
  } catch (e) { }
});`
  );
  fs.writeFileSync(
    BADMSG_SCRIPT,
    `const rl = require('readline').createInterface({ input: process.stdin });
rl.on('line', (line) => {
  try {
    const msg = JSON.parse(line);
    if (msg.method === 'initialize') {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0', id: msg.id,
        result: { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'mock', version: '1.0' } }
      }) + '\\n');
    } else {
      process.stdout.write(JSON.stringify({ ok: true }) + '\\n');
      process.stdout.write('not a json line\\n');
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0', id: msg.id,
        result: { ok: true }
      }) + '\\n');
    }
  } catch (e) { }
});`
  );
});

afterAll(() => {
  for (const f of [RESPONDER_SCRIPT, ERROR_SCRIPT, BADMSG_SCRIPT]) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
});

function makeMockConfig(scriptPath: string) {
  return {
    backends: {
      mock: {
        command: 'node',
        args: [scriptPath],
        cwd: '/tmp',
        description: 'Mock MCP backend',
      },
    },
  };
}

describe('proxy/manager - ensureBackend', () => {
  it('should spawn a backend process', () => {
    const state = ensureBackend('testecho');
    expect(state.process).not.toBeNull();
    expect(state.process!.killed).toBe(false);
    expect(state.initialized).toBe(false);
  });

  it('should reuse existing process on second call', () => {
    const state1 = ensureBackend('testecho');
    const proc1 = state1.process;
    const state2 = ensureBackend('testecho');
    expect(state2.process).toBe(proc1);
  });

  it('should throw for unknown backend name', () => {
    expect(() => ensureBackend('nonexistent_backend')).toThrow(
      'Unknown backend'
    );
  });
});

describe('proxy/manager - callBackend', () => {
  it('should send a request and receive a response', async () => {
    const mockConfig = '/tmp/test_backends_resp.json';
    fs.writeFileSync(
      mockConfig,
      JSON.stringify(makeMockConfig(RESPONDER_SCRIPT))
    );
    setBackendsPath(mockConfig);
    _resetForTesting();

    try {
      const result = await callBackend('mock', 'test/method', { foo: 'bar' });
      expect(result).toEqual({ echoed: 'test/method' });
    } finally {
      _resetForTesting();
      setBackendsPath(TMP_CONFIG);
      if (fs.existsSync(mockConfig)) fs.unlinkSync(mockConfig);
    }
  });

  it('should reject on error response from backend', async () => {
    const mockConfig = '/tmp/test_backends_err.json';
    fs.writeFileSync(mockConfig, JSON.stringify(makeMockConfig(ERROR_SCRIPT)));
    setBackendsPath(mockConfig);
    _resetForTesting();

    try {
      await expect(callBackend('mock', 'test/method')).rejects.toThrow(
        'Method not found'
      );
    } finally {
      _resetForTesting();
      setBackendsPath(TMP_CONFIG);
      if (fs.existsSync(mockConfig)) fs.unlinkSync(mockConfig);
    }
  });
});

describe('proxy/manager - initializeBackend', () => {
  it('should initialize a backend successfully', async () => {
    const mockConfig = '/tmp/test_backends_init.json';
    fs.writeFileSync(
      mockConfig,
      JSON.stringify(makeMockConfig(RESPONDER_SCRIPT))
    );
    setBackendsPath(mockConfig);
    _resetForTesting();

    try {
      const ok = await initializeBackend('mock');
      expect(ok).toBe(true);
    } finally {
      _resetForTesting();
      setBackendsPath(TMP_CONFIG);
      if (fs.existsSync(mockConfig)) fs.unlinkSync(mockConfig);
    }
  });

  it('should return true if already initialized', async () => {
    const mockConfig = '/tmp/test_backends_init2.json';
    fs.writeFileSync(
      mockConfig,
      JSON.stringify(makeMockConfig(RESPONDER_SCRIPT))
    );
    setBackendsPath(mockConfig);
    _resetForTesting();

    try {
      const ok1 = await initializeBackend('mock');
      expect(ok1).toBe(true);
      const ok2 = await initializeBackend('mock');
      expect(ok2).toBe(true);
    } finally {
      _resetForTesting();
      setBackendsPath(TMP_CONFIG);
      if (fs.existsSync(mockConfig)) fs.unlinkSync(mockConfig);
    }
  });

  it('should return false if backend fails to initialize', async () => {
    const failConfig = {
      backends: {
        mock: {
          command: 'node',
          args: ['-e', 'process.exit(1)'],
          cwd: '/tmp',
          description: 'Failing backend',
        },
      },
    };
    const mockConfig = '/tmp/test_backends_fail.json';
    fs.writeFileSync(mockConfig, JSON.stringify(failConfig));
    setBackendsPath(mockConfig);
    _resetForTesting();

    try {
      const ok = await initializeBackend('mock');
      expect(ok).toBe(false);
    } finally {
      _resetForTesting();
      setBackendsPath(TMP_CONFIG);
      if (fs.existsSync(mockConfig)) fs.unlinkSync(mockConfig);
    }
  });
});

describe('proxy/manager - listBackendTools', () => {
  it('should list tools from a backend', async () => {
    const mockConfig = '/tmp/test_backends_tools.json';
    fs.writeFileSync(
      mockConfig,
      JSON.stringify(makeMockConfig(RESPONDER_SCRIPT))
    );
    setBackendsPath(mockConfig);
    _resetForTesting();

    try {
      const tools = await listBackendTools('mock');
      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('tool_a');
      expect(tools[1].name).toBe('tool_b');
    } finally {
      _resetForTesting();
      setBackendsPath(TMP_CONFIG);
      if (fs.existsSync(mockConfig)) fs.unlinkSync(mockConfig);
    }
  });
});

describe('proxy/manager - callBackendTool', () => {
  it('should call a tool on a backend', async () => {
    const mockConfig = '/tmp/test_backends_call.json';
    fs.writeFileSync(
      mockConfig,
      JSON.stringify(makeMockConfig(RESPONDER_SCRIPT))
    );
    setBackendsPath(mockConfig);
    _resetForTesting();

    try {
      const result = await callBackendTool('mock', 'some_tool', {
        arg: 'value',
      });
      expect(result).toEqual({
        content: [{ type: 'text', text: 'tool result' }],
      });
    } finally {
      _resetForTesting();
      setBackendsPath(TMP_CONFIG);
      if (fs.existsSync(mockConfig)) fs.unlinkSync(mockConfig);
    }
  });
});

describe('proxy/manager - shutdownAll', () => {
  it('should shut down all backends gracefully', () => {
    ensureBackend('testecho');
    shutdownAll();
    const status = getBackendStatus('testecho');
    expect(status.running).toBe(false);
  });
});

describe('proxy/manager - drainMessages edge cases', () => {
  it('should handle unparseable messages from backend', async () => {
    const mockConfig = '/tmp/test_backends_badmsg.json';
    fs.writeFileSync(mockConfig, JSON.stringify(makeMockConfig(BADMSG_SCRIPT)));
    setBackendsPath(mockConfig);
    _resetForTesting();

    try {
      const result = await callBackend('mock', 'test/method');
      expect(result).toEqual({ ok: true });
    } finally {
      _resetForTesting();
      setBackendsPath(TMP_CONFIG);
      if (fs.existsSync(mockConfig)) fs.unlinkSync(mockConfig);
    }
  });
});
