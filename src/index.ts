/**
 * MCP Server Entry Point
 * Ling-term-mcp (灵犀) - AI Terminal Operations MCP Server
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from './tools/execute_command.js';
import { session } from './tools/session.js';
import { auditReport } from './tools/audit_report.js';
import { authorize } from './tools/authorize.js';
import { governance } from './tools/list_governance.js';
import { proxy } from './tools/proxy.js';
import { startFileGuardian } from './audit/file_guardian.js';

/**
 * MCP Server configuration
 */
const SERVER_CONFIG = {
  name: 'ling-term-mcp',
  version: '1.3.0',
  description: 'AI terminal operations MCP server (灵犀)',
};

/**
 * Create and configure MCP Server
 */
export function createServer(): Server {
  const server = new Server(
    {
      name: SERVER_CONFIG.name,
      version: SERVER_CONFIG.version,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        executeCommand.definition,
        session.definition,
        auditReport.definition,
        authorize.definition,
        governance.definition,
        proxy.definition,
      ],
    };
  });

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'execute_command':
          return await executeCommand.handler(args);
        case 'session':
          return await session.handler(args);
        case 'audit_report':
          return await auditReport.handler(args);
        case 'authorize':
          return await authorize.handler(args);
        case 'governance':
          return await governance.handler(args);
        case 'proxy':
          return await proxy.handler(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Start MCP Server
 */
export async function startMCPServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  startFileGuardian();
  console.error(`${SERVER_CONFIG.name} (灵犀) started successfully`);
}
