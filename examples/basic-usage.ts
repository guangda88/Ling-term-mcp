#!/usr/bin/env node

/**
 * Example: Basic usage of Ling-term-mcp with the MCP SDK
 * This example demonstrates how to connect to the MCP server and execute commands
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function main() {
  // Create MCP client
  const transport = new StdioClientTransport({
    command: 'node',
    args: [new URL('../dist/cli.js', import.meta.url).pathname],
  });

  const client = new Client({
    name: 'example-client',
    version: '1.0.0',
  }, {
    capabilities: {},
  });

  try {
    // Connect to server
    await client.connect(transport);
    console.log('✅ Connected to Ling-term-mcp server\n');

    // List available tools
    const tools = await client.listTools();
    console.log('Available tools:');
    tools.tools.forEach(tool => {
      console.log(`  - ${tool.name}: ${tool.description}`);
    });
    console.log();

    // Example 1: Execute a simple command
    console.log('Example 1: Execute ls command');
    const result1 = await client.callTool({
      name: 'execute_command',
      arguments: {
        command: 'ls',
        args: ['-la']
      }
    });
    console.log('Result:', result1.content[0].text);
    console.log();

    // Example 2: Get current working directory
    console.log('Example 2: Get current directory');
    const result2 = await client.callTool({
      name: 'execute_command',
      arguments: {
        command: 'pwd'
      }
    });
    console.log('Result:', result2.content[0].text);
    console.log();

    // Example 3: Create a session
    console.log('Example 3: Create a new session');
    const result3 = await client.callTool({
      name: 'create_session',
      arguments: {
        name: 'example-session',
        working_directory: process.cwd()
      }
    });
    console.log('Result:', result3.content[0].text);
    console.log();

    // Example 4: List all sessions
    console.log('Example 4: List all sessions');
    const result4 = await client.callTool({
      name: 'list_sessions',
      arguments: {}
    });
    console.log('Result:', result4.content[0].text);
    console.log();

    console.log('✅ Examples completed successfully');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
