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
import { syncTerminal } from './tools/sync_terminal.js';
import { listSessions } from './tools/list_sessions.js';
import { createSession } from './tools/create_session.js';
import { destroySession } from './tools/destroy_session.js';
import { auditReport } from './tools/audit_report.js';
import {
  requireAuthorization,
  approveAuthorization,
  listAuthorizations,
} from './tools/authorize.js';

/**
 * MCP Server configuration
 */
const SERVER_CONFIG = {
  name: 'ling-term-mcp',
  version: '1.0.0',
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
        syncTerminal.definition,
        listSessions.definition,
        createSession.definition,
        destroySession.definition,
        auditReport.definition,
        requireAuthorization.definition,
        approveAuthorization.definition,
        listAuthorizations.definition,
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
        case 'sync_terminal':
          return await syncTerminal.handler(args);
        case 'list_sessions':
          return await listSessions.handler();
        case 'create_session':
          return await createSession.handler(args);
        case 'destroy_session':
          return await destroySession.handler(args);
        case 'audit_report':
          return await auditReport.handler(args);
        case 'require_authorization':
          return await requireAuthorization.handler(args);
        case 'approve_authorization':
          return await approveAuthorization.handler(args);
        case 'list_authorizations':
          return await listAuthorizations.handler(args);
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
  console.error(`${SERVER_CONFIG.name} (灵犀) started successfully`);
}
