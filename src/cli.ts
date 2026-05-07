#!/usr/bin/env node

import { startMCPServer } from './index.js';
import { startHTTPProxyServer } from './http-proxy.js';

const mode = process.argv[2] || 'stdio';

async function main() {
  try {
    if (mode === 'http') {
      await startHTTPProxyServer();
    } else if (mode === 'stdio') {
      await startMCPServer();
    } else {
      console.error(`Usage: ling-term-mcp [stdio|http]`);
      console.error(`  stdio  - MCP stdio transport (default)`);
      console.error(`  http   - HTTP proxy on port 9529`);
      process.exit(1);
    }
  } catch (error) {
    console.error('Failed to start:', error);
    process.exit(1);
  }
}

main();
