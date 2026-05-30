import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';

type RequestHandler = (req: IncomingMessage, res: ServerResponse) => void;

let capturedHandler: RequestHandler | null = null;

jest.mock('http', () => {
  const actual = jest.requireActual('http');
  return {
    ...actual,
    createServer: (handler: RequestHandler) => {
      capturedHandler = handler;
      return {
        listen: jest.fn((_p: number, _h: string, cb: () => void) => cb()),
        close: jest.fn(),
      };
    },
  };
});

jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => ({
    connect: jest.fn(),
  })),
}));

jest.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: jest.fn().mockImplementation(() => ({
    handleRequest: jest.fn(),
  })),
}));

import { startHTTPProxy } from '../../src/templates/mcp-http-proxy';

function mockReq(
  opts: {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    remoteAddress?: string;
  } = {}
): IncomingMessage {
  const req = new IncomingMessage(new Socket());
  req.url = opts.url || '/health';
  req.method = opts.method || 'GET';
  req.headers = opts.headers || {};
  (req.socket as any) = { remoteAddress: opts.remoteAddress || '127.0.0.1' };
  return req;
}

function mockRes() {
  const headers: Record<string, string> = {};

  const res = {
    writeHead: jest.fn((_code: number, hdrs?: Record<string, string>) => {
      if (hdrs) Object.assign(headers, hdrs);
    }),
    end: jest.fn(),
    headersSent: false,
  } as unknown as ServerResponse;

  return { res, headers };
}

let cleanup: (() => void) | null = null;

async function initProxy(config: {
  authToken?: string;
  rateLimit?: { windowMs: number; maxRequests: number };
}) {
  capturedHandler = null;
  if (cleanup) cleanup();
  cleanup = await startHTTPProxy({
    createServer: () => ({ connect: jest.fn() }) as any,
    name: 'test',
    port: 19999,
    host: '127.0.0.1',
    authToken: config.authToken,
    rateLimit: config.rateLimit,
  });
}

async function request(opts: {
  url?: string;
  headers?: Record<string, string>;
  remoteAddress?: string;
}) {
  const req = mockReq({
    url: opts.url || '/health',
    method: 'GET',
    headers: opts.headers,
    remoteAddress: opts.remoteAddress,
  });
  const { res, headers } = mockRes();

  await capturedHandler!(req, res);

  const body =
    (res as any).end.mock.calls.length > 0
      ? (res as any).end.mock.calls[0][0] || ''
      : '';
  const status =
    (res as any).writeHead.mock.calls.length > 0
      ? (res as any).writeHead.mock.calls[0][0]
      : 0;
  const respHeaders =
    (res as any).writeHead.mock.calls.length > 0
      ? (res as any).writeHead.mock.calls[0][1] || {}
      : {};
  return { status, body, headers: { ...headers, ...respHeaders } };
}

describe('MCP HTTP Proxy Middleware', () => {
  afterAll(() => {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
  });

  describe('checkAuth', () => {
    it('passes when no authToken configured', async () => {
      await initProxy({});
      const r = await request({});
      expect(r.status).toBe(200);
      expect(r.body).toContain('ok');
    });

    it('rejects request without Authorization header', async () => {
      await initProxy({ authToken: 'secret' });
      const r = await request({});
      expect(r.status).toBe(401);
      expect(r.body).toContain('-32001');
      expect(r.headers).toHaveProperty('WWW-Authenticate');
    });

    it('rejects wrong Bearer token', async () => {
      await initProxy({ authToken: 'correct' });
      const r = await request({ headers: { authorization: 'Bearer wrong' } });
      expect(r.status).toBe(401);
      expect(r.body).toContain('-32001');
    });

    it('allows correct Bearer token', async () => {
      await initProxy({ authToken: 'my-token' });
      const r = await request({
        headers: { authorization: 'Bearer my-token' },
      });
      expect(r.status).toBe(200);
      expect(r.body).toContain('ok');
    });

    it('is case-insensitive for Bearer scheme', async () => {
      await initProxy({ authToken: 'my-token' });
      const r = await request({
        headers: { authorization: 'bearer my-token' },
      });
      expect(r.status).toBe(200);
    });
  });

  describe('checkRateLimit', () => {
    it('passes when no rateLimit configured', async () => {
      await initProxy({});
      for (let i = 0; i < 5; i++) {
        const r = await request({});
        expect(r.status).toBe(200);
      }
    });

    it('allows requests within the limit', async () => {
      await initProxy({ rateLimit: { windowMs: 5000, maxRequests: 5 } });
      for (let i = 0; i < 5; i++) {
        const r = await request({});
        expect(r.status).toBe(200);
      }
    });

    it('rejects requests exceeding the limit', async () => {
      await initProxy({ rateLimit: { windowMs: 5000, maxRequests: 2 } });
      const r1 = await request({});
      expect(r1.status).toBe(200);
      const r2 = await request({});
      expect(r2.status).toBe(200);
      const r3 = await request({});
      expect(r3.status).toBe(429);
      expect(r3.body).toContain('-32029');
    });

    it('includes Retry-After header on 429', async () => {
      await initProxy({ rateLimit: { windowMs: 3000, maxRequests: 1 } });
      await request({});
      const r = await request({});
      expect(r.status).toBe(429);
      expect(r.headers).toHaveProperty('Retry-After');
    });

    it('tracks per-IP separately', async () => {
      await initProxy({ rateLimit: { windowMs: 5000, maxRequests: 1 } });
      const r1 = await request({ remoteAddress: '1.1.1.1' });
      expect(r1.status).toBe(200);

      const r2 = await request({ remoteAddress: '2.2.2.2' });
      expect(r2.status).toBe(200);

      const r3 = await request({ remoteAddress: '1.1.1.1' });
      expect(r3.status).toBe(429);
    });
  });

  describe('checkAuth edge cases', () => {
    it('rejects malformed Authorization header (no Bearer scheme)', async () => {
      await initProxy({ authToken: 'secret' });
      const r = await request({ headers: { authorization: 'Basic abc123' } });
      expect(r.status).toBe(401);
      expect(r.body).toContain('-32001');
    });

    it('rejects empty Bearer token', async () => {
      await initProxy({ authToken: 'secret' });
      const r = await request({ headers: { authorization: 'Bearer ' } });
      expect(r.status).toBe(401);
    });

    it('handles extra whitespace before token correctly', async () => {
      await initProxy({ authToken: 'secret' });
      const r = await request({
        headers: { authorization: 'Bearer  secret' },
      });
      expect(r.status).toBe(200);
    });

    it('returns WWW-Authenticate header with Bearer realm', async () => {
      await initProxy({ authToken: 'secret' });
      const r = await request({});
      expect(r.headers['WWW-Authenticate']).toBe('Bearer realm="mcp"');
    });

    it('returns jsonrpc error format on auth failure', async () => {
      await initProxy({ authToken: 'secret' });
      const r = await request({});
      const body = JSON.parse(r.body);
      expect(body.jsonrpc).toBe('2.0');
      expect(body.error.code).toBe(-32001);
      expect(body.id).toBeNull();
    });
  });

  describe('checkRateLimit edge cases', () => {
    it('respects x-forwarded-for header for IP', async () => {
      await initProxy({ rateLimit: { windowMs: 5000, maxRequests: 1 } });
      const r1 = await request({
        headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' },
      });
      expect(r1.status).toBe(200);

      const r2 = await request({ headers: { 'x-forwarded-for': '10.0.0.1' } });
      expect(r2.status).toBe(429);

      const r3 = await request({
        headers: { 'x-forwarded-for': '10.0.0.3' },
        remoteAddress: '1.1.1.1',
      });
      expect(r3.status).toBe(200);
    });

    it('resets counter after window expires', async () => {
      await initProxy({ rateLimit: { windowMs: 100, maxRequests: 1 } });
      const r1 = await request({});
      expect(r1.status).toBe(200);

      const r2 = await request({});
      expect(r2.status).toBe(429);

      await new Promise((resolve) => setTimeout(resolve, 150));

      const r3 = await request({});
      expect(r3.status).toBe(200);
    });

    it('returns jsonrpc error format on rate limit', async () => {
      await initProxy({ rateLimit: { windowMs: 5000, maxRequests: 1 } });
      await request({});
      const r = await request({});
      const body = JSON.parse(r.body);
      expect(body.jsonrpc).toBe('2.0');
      expect(body.error.code).toBe(-32029);
      expect(body.id).toBeNull();
    });

    it('calculates Retry-After based on window remaining', async () => {
      await initProxy({ rateLimit: { windowMs: 5000, maxRequests: 1 } });
      await request({});
      const r = await request({});
      const retryAfter = parseInt(r.headers['Retry-After'], 10);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(5);
    });
  });

  describe('auth + rateLimit combined', () => {
    it('rejects unauthenticated before rate limit check', async () => {
      await initProxy({
        authToken: 'secret',
        rateLimit: { windowMs: 5000, maxRequests: 100 },
      });
      const r = await request({});
      expect(r.status).toBe(401);
    });

    it('allows authenticated request within rate limit', async () => {
      await initProxy({
        authToken: 'tok',
        rateLimit: { windowMs: 5000, maxRequests: 100 },
      });
      const r = await request({ headers: { authorization: 'Bearer tok' } });
      expect(r.status).toBe(200);
    });

    it('rejects authenticated request over rate limit', async () => {
      await initProxy({
        authToken: 'tok',
        rateLimit: { windowMs: 5000, maxRequests: 1 },
      });
      await request({ headers: { authorization: 'Bearer tok' } });
      const r = await request({ headers: { authorization: 'Bearer tok' } });
      expect(r.status).toBe(429);
    });
  });
});
