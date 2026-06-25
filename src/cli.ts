#!/usr/bin/env node

import { startMCPServer } from './index.js';
import { startHTTPProxyServer } from './http-proxy.js';
import { startGatewayServer } from './gateway/server.js';

const mode = process.argv[2] || 'stdio';

async function main() {
  try {
    if (mode === 'http') {
      await startHTTPProxyServer();
    } else if (mode === 'gateway') {
      await startGatewayServer();
    } else if (mode === 'stdio') {
      await startMCPServer();
    } else {
      console.error(`Usage: ling-term-mcp [stdio|http|gateway]`);
      console.error(`  stdio    - MCP stdio transport (default)`);
      console.error(`  http     - HTTP proxy on port 9529`);
      console.error(`  gateway  - Command execution gateway on port 9532`);
      process.exit(1);
    }
  } catch (error) {
    console.error('Failed to start:', error);
    process.exit(1);
  }
}

main();
