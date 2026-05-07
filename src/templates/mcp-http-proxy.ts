/**
 * TypeScript MCP HTTP Proxy Template
 *
 * Reusable pattern for wrapping any stdio-based TypeScript MCP server
 * with StreamableHTTPServerTransport.
 *
 * Usage:
 *   1. Import { createServer } from your MCP server entry point
 *   2. Call startHTTPProxy({ createServer, port, host, name })
 *   3. CLI: `tsx src/cli.ts http`
 *
 * Dependencies:
 *   npm install @modelcontextprotocol/sdk
 *   (ships with @hono/node-server and hono for StreamableHTTPServerTransport)
 */

import {
  createServer as createHttpServer,
  IncomingMessage,
  ServerResponse,
} from 'http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface HTTPProxyOptions {
  createServer: () => Server;
  name: string;
  port?: number;
  host?: string;
  portEnv?: string;
  hostEnv?: string;
  authToken?: string;
  rateLimit?: RateLimitConfig;
}

export async function startHTTPProxy(options: HTTPProxyOptions): Promise<void> {
  const {
    createServer,
    name,
    portEnv = 'MCP_HTTP_PORT',
    hostEnv = 'MCP_HTTP_HOST',
    authToken,
    rateLimit,
  } = options;
  const port = parseInt(process.env[portEnv] || '', 10) || options.port || 9529;
  const host = process.env[hostEnv] || options.host || '127.0.0.1';

  const rateLimitState = new Map<string, { count: number; resetAt: number }>();

  function getClientIp(req: IncomingMessage): string {
    return (
      (req.headers['x-forwarded-for'] as string | undefined)
        ?.split(',')[0]
        ?.trim() ||
      req.socket?.remoteAddress ||
      'unknown'
    );
  }

  function checkRateLimit(req: IncomingMessage, res: ServerResponse): boolean {
    if (!rateLimit) return true;
    const ip = getClientIp(req);
    const now = Date.now();
    const entry = rateLimitState.get(ip);

    if (!entry || now >= entry.resetAt) {
      rateLimitState.set(ip, {
        count: 1,
        resetAt: now + rateLimit.windowMs,
      });
      return true;
    }

    entry.count++;
    if (entry.count > rateLimit.maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
      });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32029,
            message: `Rate limit exceeded. Retry after ${retryAfter}s.`,
          },
          id: null,
        })
      );
      return false;
    }

    return true;
  }

  function checkAuth(req: IncomingMessage, res: ServerResponse): boolean {
    if (!authToken) return true;
    const header = req.headers['authorization'] || '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match || match[1] !== authToken) {
      res.writeHead(401, {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer realm="mcp"',
      });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Unauthorized: invalid or missing Bearer token',
          },
          id: null,
        })
      );
      return false;
    }
    return true;
  }

  const httpServer = createHttpServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || '/', `http://${host}:${port}`);

      if (req.method === 'GET' && url.pathname === '/health') {
        if (!checkAuth(req, res)) return;
        if (!checkRateLimit(req, res)) return;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'ok',
            name,
            uptime: process.uptime(),
          })
        );
        return;
      }

      if (!checkAuth(req, res)) return;
      if (!checkRateLimit(req, res)) return;

      try {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        const server = createServer();
        await server.connect(transport);
        await transport.handleRequest(req, res);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[${name}] Request error:`, message);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              error: {
                code: -32603,
                message: 'Internal error: ' + message,
              },
              id: null,
            })
          );
        }
      }
    }
  );

  httpServer.listen(port, host, () => {
    console.error(`${name} HTTP proxy started on http://${host}:${port}`);
  });

  const shutdown = () => {
    console.error(`${name} shutting down...`);
    httpServer.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
