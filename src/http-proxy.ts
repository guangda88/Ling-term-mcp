import { startHTTPProxy } from './templates/mcp-http-proxy.js';
import { createServer } from './index.js';

export async function startHTTPProxyServer(): Promise<void> {
  return startHTTPProxy({
    createServer,
    name: 'ling-term-mcp',
    port: 9529,
    portEnv: 'LING_TERM_HTTP_PORT',
    hostEnv: 'LING_TERM_HTTP_HOST',
  });
}
