import { startHTTPProxy } from './templates/mcp-http-proxy.js';
import { createServer } from './index.js';

export async function startHTTPProxyServer(): Promise<void> {
  await startHTTPProxy({
    createServer,
    name: 'ling-term-mcp',
    port: 9529,
    portEnv: 'LING_TERM_HTTP_PORT',
    hostEnv: 'LING_TERM_HTTP_HOST',
    authToken: process.env.LING_TERM_AUTH_TOKEN,
    rateLimit: {
      windowMs: 60_000,
      maxRequests: 100,
    },
  });
}
