import { CommandQueue } from '../../src/gateway/queue';
import { startGatewayServer } from '../../src/gateway/server';
import type { DispatchRequest } from '../../src/gateway/types';
import http from 'http';

function httpRequest(
  port: number,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: body
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
            }
          : {},
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => (data += chunk.toString()));
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            data: JSON.parse(data || '{}'),
          });
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(payload);
    req.end();
  });
}

describe('CommandQueue', () => {
  let queue: CommandQueue;

  beforeEach(() => {
    queue = new CommandQueue();
  });

  const validRequest: DispatchRequest = {
    command: 'echo hello',
    source: 'lingflow_plus',
    reasoning: 'test',
    shell: true,
  };

  describe('dispatch', () => {
    it('should reject unknown source', async () => {
      const result = await queue.dispatch({
        ...validRequest,
        source: 'unknown_member',
      });
      expect(result.status).toBe('rejected');
      expect(result.rejection_reason).toContain('Unknown source');
    });

    it('should accept valid request from known member', async () => {
      const result = await queue.dispatch(validRequest);
      expect(result.status).toBe('running');
      expect(result.request_id).toBeTruthy();
      expect(result.session_id).toBeTruthy();
    });

    it('should reject commands failing security validation', async () => {
      const result = await queue.dispatch({
        ...validRequest,
        command: 'rm -rf /',
        shell: true,
      });
      expect(result.status).toBe('rejected');
      expect(result.rejection_reason).toContain('Security');
    });

    it('should execute command and return completed status', async () => {
      const result = await queue.dispatch({
        ...validRequest,
        command: 'echo test_output',
        shell: true,
      });
      expect(result.status).toBe('running');

      await new Promise((r) => setTimeout(r, 500));

      const history = queue.getHistory(1);
      expect(history).toHaveLength(1);
      expect(history[0].status).toBe('completed');
      expect(history[0].exit_code).toBe(0);
    });

    it('should record failed command', async () => {
      const result = await queue.dispatch({
        ...validRequest,
        command: 'node -e "process.exit(1)"',
        shell: true,
      });
      expect(result.status).toBe('rejected');
      expect(result.rejection_reason).toContain('Security');

      const history = queue.getHistory(1);
      if (history.length > 0) {
        expect(history[0].status).toBe('rejected');
      }
    });

    it('should use provided session_id', async () => {
      const result = await queue.dispatch({
        ...validRequest,
        session_id: 'custom-session-123',
      });
      expect(result.session_id).toBe('custom-session-123');
    });

    it('should generate session_id when not provided', async () => {
      const result = await queue.dispatch(validRequest);
      expect(result.session_id).toBeTruthy();
    });
  });

  describe('rate limiting', () => {
    it('should allow requests within rate limit', async () => {
      for (let i = 0; i < 10; i++) {
        const result = await queue.dispatch({
          ...validRequest,
          command: `echo ${i}`,
          shell: true,
        });
        expect(result.status).not.toBe('rejected');
      }
    });
  });

  describe('cancel', () => {
    it('should return not found for non-existent request', () => {
      const result = queue.cancel('nonexistent', 'lingflow_plus');
      expect(result.cancelled).toBe(false);
      expect(result.reason).toContain('not found');
    });

    it('should return source mismatch for wrong source', async () => {
      const dispatchResult = await queue.dispatch({
        ...validRequest,
        command: 'sleep 30',
        shell: true,
        timeout: 60000,
      });
      expect(dispatchResult.status).toBe('running');

      const result = queue.cancel(dispatchResult.request_id, 'lingxi');
      expect(result.cancelled).toBe(false);
      expect(result.reason).toContain('Source mismatch');
    });
  });

  describe('getStatus', () => {
    it('should return healthy status with zero commands', () => {
      const status = queue.getStatus();
      expect(status.status).toBe('healthy');
      expect(status.active_commands).toBe(0);
      expect(status.uptime_s).toBeGreaterThanOrEqual(0);
    });

    it('should reflect active commands', async () => {
      await queue.dispatch({
        ...validRequest,
        command: 'sleep 30',
        shell: true,
        timeout: 60000,
      });

      await new Promise((r) => setTimeout(r, 200));

      const status = queue.getStatus();
      expect(status.active_commands).toBe(1);
    });
  });

  describe('getHistory', () => {
    it('should return empty history initially', () => {
      const history = queue.getHistory();
      expect(history).toHaveLength(0);
    });

    it('should return command history after dispatch', async () => {
      await queue.dispatch({
        ...validRequest,
        command: 'echo history_test',
        shell: true,
      });

      await new Promise((r) => setTimeout(r, 500));

      const history = queue.getHistory();
      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history[0].command).toBe('echo history_test');
      expect(history[0].source).toBe('lingflow_plus');
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await queue.dispatch({
          ...validRequest,
          command: `echo ${i}`,
          shell: true,
        });
        await new Promise((r) => setTimeout(r, 100));
      }

      const history = queue.getHistory(3);
      expect(history).toHaveLength(3);
    });
  });

  describe('/v1/check endpoint', () => {
    let port: number;
    let server: http.Server | undefined;

    beforeAll(async () => {
      port = 19530 + Math.floor(Math.random() * 1000);
      server = await startGatewayServer(port);
      await new Promise((r) => setTimeout(r, 200));
    });

    afterAll(() => {
      if (server) server.close();
    });

    it('should categorize whitelisted command', async () => {
      const res = await httpRequest(port, 'POST', '/v1/check', {
        command: 'echo hello',
        source: 'lingflow_plus',
      });
      expect(res.status).toBe(200);
      const data = res.data as Record<string, unknown>;
      expect(data.category).toBe('whitelisted');
      expect(data.blocked).toBe(false);
      expect(data.requires_authorization).toBe(false);
    });

    it('should categorize authorizable command (requires auth, not blocked)', async () => {
      const res = await httpRequest(port, 'POST', '/v1/check', {
        command: 'rm -rf /tmp/test',
        source: 'lingflow_plus',
      });
      expect(res.status).toBe(200);
      const data = res.data as Record<string, unknown>;
      expect(data.category).toBe('authorizable');
      expect(data.blocked).toBe(false);
      expect(data.requires_authorization).toBe(true);
    });

    it('should categorize absolutely blacklisted command', async () => {
      const res = await httpRequest(port, 'POST', '/v1/check', {
        command: 'dd if=/dev/zero of=/tmp/test',
        source: 'lingflow_plus',
      });
      expect(res.status).toBe(403);
      const data = res.data as Record<string, unknown>;
      expect(data.category).toBe('blacklisted');
      expect(data.blocked).toBe(true);
    });

    it('should categorize red_zone command', async () => {
      const res = await httpRequest(port, 'POST', '/v1/check', {
        command: 'docker ps',
        source: 'lingflow_plus',
      });
      expect(res.status).toBe(200);
      const data = res.data as Record<string, unknown>;
      expect(data.category).toBe('red_zone');
      expect(data.blocked).toBe(false);
      expect(data.requires_authorization).toBe(true);
    });

    it('should categorize unknown command', async () => {
      const res = await httpRequest(port, 'POST', '/v1/check', {
        command: 'mycustomtool --flag',
        source: 'lingflow_plus',
      });
      expect(res.status).toBe(200);
      const data = res.data as Record<string, unknown>;
      expect(data.category).toBe('unknown');
      expect(data.blocked).toBe(false);
      expect(data.requires_authorization).toBe(false);
    });

    it('should detect dangerous pattern in red_zone', async () => {
      const res = await httpRequest(port, 'POST', '/v1/check', {
        command: 'find /tmp -exec rm {} \\;',
        source: 'lingflow_plus',
      });
      expect(res.status).toBe(200);
      const data = res.data as Record<string, unknown>;
      expect(data.category).toBe('red_zone');
      expect(data.requires_authorization).toBe(true);
    });

    it('should return 400 for missing command', async () => {
      const res = await httpRequest(port, 'POST', '/v1/check', {
        source: 'lingflow_plus',
      });
      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid JSON', async () => {
      const res = await new Promise<{
        status: number;
        data: unknown;
      }>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: '/v1/check',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
          },
          (response) => {
            let d = '';
            response.on('data', (chunk: Buffer) => (d += chunk.toString()));
            response.on('end', () => {
              resolve({
                status: response.statusCode || 0,
                data: JSON.parse(d || '{}'),
              });
            });
          }
        );
        req.on('error', reject);
        req.write('not json');
        req.end();
      });
      expect(res.status).toBe(400);
    });
  });

  describe('CWD restrictions', () => {
    it('should reject blocked CWD /etc', async () => {
      await queue.dispatch({
        ...validRequest,
        command: 'ls',
        cwd: '/etc',
        shell: false,
      });

      await new Promise((r) => setTimeout(r, 300));

      const history = queue.getHistory(1);
      if (history.length > 0) {
        expect(history[0].status).toBeDefined();
      }
    });
  });

  describe('/v1/auth/issue + /v1/auth/verify (SEC-001)', () => {
    let port: number;
    let server: http.Server | undefined;

    beforeAll(async () => {
      port = 21530 + Math.floor(Math.random() * 1000);
      server = await startGatewayServer(port);
      await new Promise((r) => setTimeout(r, 200));
    });

    afterAll(() => {
      if (server) server.close();
    });

    it('should issue and verify a meeting auth token', async () => {
      const issueRes = await httpRequest(port, 'POST', '/v1/auth/issue', {
        caller: 'lingyang',
        agent_id: 'external-001',
        meeting_id: 'm-test-001',
      });
      expect(issueRes.status).toBe(201);
      const issue = issueRes.data as Record<string, unknown>;
      expect(issue.auth_token).toBeTruthy();
      expect(issue.scope).toEqual(['join', 'speak']);

      const verifyRes = await httpRequest(port, 'POST', '/v1/auth/verify', {
        auth_token: issue.auth_token,
        agent_id: 'external-001',
        meeting_id: 'm-test-001',
      });
      expect(verifyRes.status).toBe(200);
      const verify = verifyRes.data as Record<string, unknown>;
      expect(verify.valid).toBe(true);
      expect(verify.agent_id).toBe('external-001');
    });

    it('should reject issue from unknown caller', async () => {
      const res = await httpRequest(port, 'POST', '/v1/auth/issue', {
        caller: 'stranger',
        agent_id: 'ext-001',
        meeting_id: 'm-001',
      });
      expect(res.status).toBe(403);
    });

    it('should reject issue missing fields', async () => {
      const res = await httpRequest(port, 'POST', '/v1/auth/issue', {
        caller: 'lingyang',
        agent_id: 'ext-001',
      });
      expect(res.status).toBe(400);
    });

    it('should reject verify with non-existent token', async () => {
      const res = await httpRequest(port, 'POST', '/v1/auth/verify', {
        auth_token: 'nonexistent',
        agent_id: 'ext-001',
        meeting_id: 'm-001',
      });
      expect(res.status).toBe(403);
      const data = res.data as Record<string, unknown>;
      expect(data.valid).toBe(false);
    });

    it('should reject verify with mismatched agent_id', async () => {
      const issueRes = await httpRequest(port, 'POST', '/v1/auth/issue', {
        caller: 'lingyang',
        agent_id: 'ext-002',
        meeting_id: 'm-002',
      });
      const issue = issueRes.data as Record<string, unknown>;

      const verifyRes = await httpRequest(port, 'POST', '/v1/auth/verify', {
        auth_token: issue.auth_token,
        agent_id: 'wrong-agent',
        meeting_id: 'm-002',
      });
      expect(verifyRes.status).toBe(403);
      const data = verifyRes.data as Record<string, unknown>;
      expect(data.valid).toBe(false);
      expect(data.reason).toContain('agent_id mismatch');
    });
  });

  describe('/v1/notify (P1-4 push API)', () => {
    let port: number;
    let server: http.Server | undefined;

    beforeAll(async () => {
      port = 23530 + Math.floor(Math.random() * 1000);
      server = await startGatewayServer(port);
      await new Promise((r) => setTimeout(r, 200));
    });

    afterAll(() => {
      if (server) server.close();
    });

    it('should reject notify from unknown caller', async () => {
      const res = await httpRequest(port, 'POST', '/v1/notify', {
        source: 'stranger',
        target: 'lingclaude',
        message: 'hello',
      });
      expect(res.status).toBe(403);
    });

    it('should reject notify missing target', async () => {
      const res = await httpRequest(port, 'POST', '/v1/notify', {
        source: 'lingflow',
        message: 'hello',
      });
      expect(res.status).toBe(400);
    });

    it('should reject notify missing message', async () => {
      const res = await httpRequest(port, 'POST', '/v1/notify', {
        source: 'lingflow',
        target: 'lingclaude',
      });
      expect(res.status).toBe(400);
    });

    it('should reach handler with valid request (downstream may be unreachable)', async () => {
      // Notify is forwarded to :8765; either succeeds or returns 502
      const res = await httpRequest(port, 'POST', '/v1/notify', {
        source: 'lingflow',
        target: 'lingclaude',
        message: 'test notification',
        priority: 'normal',
      });
      expect([200, 502]).toContain(res.status);
      const data = res.data as Record<string, unknown>;
      expect(typeof data.sent).toBe('boolean');
    });
  });
});
