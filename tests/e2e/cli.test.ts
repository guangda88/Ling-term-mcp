/**
 * E2E Tests for Ling-term-mcp
 * Tests the MCP server via HTTP proxy (StreamableHTTPServerTransport)
 */

import assert from 'node:assert';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { describe, it, before, after } from 'node:test';

const TSX = './node_modules/.bin/tsx';
const PORT = 9876;
const AUTH_TOKEN = 'e2e-test-token';

function parseSse(raw: string): any {
  const match = raw.match(/^data:\s*(.+)$/m);
  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch {
      // fall through
    }
  }
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function httpRequest(
  path: string,
  method: string,
  body?: object,
  auth?: string
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const options: http.RequestOptions = {
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
    };
    if (auth) {
      options.headers!['Authorization'] = `Bearer ${auth}`;
    }
    if (payload) {
      options.headers!['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk: Buffer) => {
        raw += chunk.toString();
      });
      res.on('end', () => {
        resolve({ status: res.statusCode || 0, data: parseSse(raw) });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe('E2E: MCP HTTP Proxy', () => {
  let serverProcess: ReturnType<typeof spawn>;

  before(async () => {
    serverProcess = spawn(TSX, ['src/cli.ts', 'http'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        LING_TERM_HTTP_PORT: String(PORT),
        LING_TERM_AUTH_TOKEN: AUTH_TOKEN,
      },
    });

    await new Promise((r) => setTimeout(r, 2000));
  });

  after(() => {
    try {
      serverProcess.kill('SIGKILL');
    } catch {
      // already dead
    }
  });

  it('should respond to health check', async () => {
    const { status, data } = await httpRequest(
      '/health',
      'GET',
      undefined,
      AUTH_TOKEN
    );
    assert.strictEqual(
      status,
      200,
      `Health status should be 200, got ${status}`
    );
    assert.strictEqual(data.status, 'ok');
    assert.strictEqual(data.name, 'ling-term-mcp');
  });

  it('should reject requests without auth token', async () => {
    const { status } = await httpRequest('/', 'POST', {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {},
    });
    assert.strictEqual(status, 401);
  });

  it('should respond to tools/list', async () => {
    const { status, data } = await httpRequest(
      '/',
      'POST',
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      AUTH_TOKEN
    );
    assert.strictEqual(status, 200, `tools/list status should be 200`);
    assert.strictEqual(data.id, 1);
    const toolNames = (data.result?.tools || []).map((t: any) => t.name);
    assert.ok(
      toolNames.includes('execute_command'),
      `Should include execute_command, got: ${toolNames.join(', ')}`
    );
    assert.ok(
      toolNames.includes('session'),
      `Should include session, got: ${toolNames.join(', ')}`
    );
    assert.ok(
      toolNames.includes('audit_report'),
      `Should include audit_report, got: ${toolNames.join(', ')}`
    );
  });

  it('should execute a command via tools/call', async () => {
    const { status, data } = await httpRequest(
      '/',
      'POST',
      {
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: {
          name: 'execute_command',
          arguments: {
            command: 'echo hello_e2e',
            caller: 'lingxi',
          },
        },
      },
      AUTH_TOKEN
    );
    assert.strictEqual(status, 200, `execute status should be 200`);
    assert.strictEqual(data.id, 10);
    const text = data.result?.content?.[0]?.text || '';
    assert.ok(
      text.includes('hello_e2e'),
      `Should contain hello_e2e in: ${text}`
    );
  });

  it('should handle invalid tool name', async () => {
    const { status, data } = await httpRequest(
      '/',
      'POST',
      {
        jsonrpc: '2.0',
        id: 20,
        method: 'tools/call',
        params: {
          name: 'nonexistent_tool_xyz',
          arguments: {},
        },
      },
      AUTH_TOKEN
    );
    assert.strictEqual(status, 200, `Should still return 200 with error`);
    assert.strictEqual(data.id, 20);
    assert.ok(data.isError === true || data.result?.isError === true);
  });
});
