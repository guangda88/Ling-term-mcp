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

export interface HTTPProxyOptions {
  createServer: () => Server;
  name: string;
  port?: number;
  host?: string;
  portEnv?: string;
  hostEnv?: string;
}

export async function startHTTPProxy(options: HTTPProxyOptions): Promise<void> {
  const {
    createServer,
    name,
    portEnv = 'MCP_HTTP_PORT',
    hostEnv = 'MCP_HTTP_HOST',
  } = options;
  const port = parseInt(process.env[portEnv] || '', 10) || options.port || 9529;
  const host = process.env[hostEnv] || options.host || '127.0.0.1';

  const httpServer = createHttpServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || '/', `http://${host}:${port}`);

      if (req.method === 'GET' && url.pathname === '/health') {
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
