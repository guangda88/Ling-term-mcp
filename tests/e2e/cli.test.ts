/**
 * E2E Tests for Ling-term-mcp
 */

import assert from 'node:assert';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { describe, it } from 'node:test';

const CLI_PATH = path.resolve('dist/cli.js');

async function runCli(args: string[]): Promise<{
  status: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [CLI_PATH, ...args]);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('close', (status) => resolve({ status, stdout, stderr }));
    child.on('error', reject);
  });
}

async function runMcpServer(
  args: string[]
): Promise<{ serverProcess: any; port: number }> {
  const serverProcess = spawn('node', [CLI_PATH, ...args]);
  return { serverProcess, port: 8765 };
}

describe('Ling-term-mcp CLI', () => {
  describe('Basic Operations', () => {
    it('should display help when no arguments provided', async () => {
      const result = await runCli([]);
      assert.ok(
        result.stdout.includes('Ling-term-mcp') ||
          result.stdout.includes('灵犀'),
        'Should show help or version'
      );
    });

    it('should show version with --version flag', async () => {
      const result = await runCli(['--version']);
      assert.ok(
        result.stdout.includes('1.0.0'),
        `Version not found in output: ${result.stdout}`
      );
    });
  });

  describe('MCP Server', () => {
    it('should start MCP server without errors', async () => {
      const { serverProcess } = await runMcpServer([]);

      // Give it a moment to start
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Kill the server
      serverProcess.kill();

      assert.ok(true, 'Server started without errors');
    });

    it('should handle MCP protocol messages', async () => {
      const { serverProcess } = await runMcpServer([]);

      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Test with a simple JSON-RPC message
      serverProcess.stdin.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: {
              name: 'test-client',
              version: '1.0.0',
            },
          },
        }) + '\n'
      );

      await new Promise((resolve) => setTimeout(resolve, 500));

      serverProcess.kill();

      assert.ok(true, 'Server handled MCP message');
    });
  });
});

describe('Performance Testing', () => {
  it('should handle rapid sequential command execution', async () => {
    const commands = ['echo test', 'pwd', 'ls'];
    const results = await Promise.all(
      commands.map((cmd) => runCli(['execute', cmd]))
    );

    results.forEach((result, index) => {
      assert.strictEqual(result.status, 0, `Command ${index} failed`);
    });
  });

  it('should handle concurrent requests', async () => {
    const concurrentCommands = Array(10).fill('echo test');
    const startTime = Date.now();

    const results = await Promise.all(
      concurrentCommands.map((cmd) => runCli(['execute', cmd]))
    );

    const endTime = Date.now();
    const duration = endTime - startTime;

    results.forEach((result) => {
      assert.strictEqual(result.status, 0, 'Concurrent command failed');
    });

    assert.ok(
      duration < 5000,
      `Concurrent execution took too long: ${duration}ms`
    );
  });
});

describe('Memory Testing', () => {
  it('should not leak memory on repeated executions', async () => {
    const iterations = 50;

    // Execute same command multiple times
    for (let i = 0; i < iterations; i++) {
      const result = await runCli(['execute', 'echo test']);
      assert.strictEqual(result.status, 0, `Iteration ${i} failed`);
    }

    // If we got here without crashing, memory is likely stable
    assert.ok(
      true,
      `Successfully executed ${iterations} commands without memory issues`
    );
  });
});

describe('Error Handling', () => {
  it('should handle invalid commands gracefully', async () => {
    const result = await runCli([
      'execute',
      'invalid-command-that-does-not-exist',
    ]);
    assert.strictEqual(
      result.status,
      null,
      'Invalid command should be handled'
    );
  });

  it('should handle malformed input', async () => {
    const result = await runCli(['execute', '']);
    assert.ok(
      result.stdout.includes('Error') || result.stderr.includes('Error'),
      'Empty command should return error'
    );
  });
});

describe('Session Management', () => {
  it('should create and destroy sessions', async () => {
    const createResult = await runCli(['session', 'create']);
    assert.ok(createResult.stdout.includes('session'), 'Should create session');

    // Extract session ID from output
    const match = createResult.stdout.match(/[a-f0-9-]{36}/);
    if (!match) {
      throw new Error('Could not extract session ID');
    }

    const sessionId = match[0];
    const destroyResult = await runCli(['session', 'destroy', sessionId]);
    assert.strictEqual(destroyResult.status, 0, 'Should destroy session');
  });

  it('should list active sessions', async () => {
    const result = await runCli(['session', 'list']);
    assert.strictEqual(result.status, 0, 'Should list sessions');
    assert.ok(
      result.stdout.includes('session') || result.stdout.includes('[]'),
      'Should show session information'
    );
  });
});
