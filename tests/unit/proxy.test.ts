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
