#!/usr/bin/env node

/**
 * Ling-term-mcp CLI Entry Point
 */

import { startMCPServer } from './index.js';

async function main() {
  try {
    await startMCPServer();
  } catch (error) {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

main();
