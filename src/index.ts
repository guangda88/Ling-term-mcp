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
import { visibleState } from './tools/visible_state.js';
import { infoDelta } from './tools/info_delta.js';
import { startFileGuardian } from './audit/file_guardian.js';
import {
  pollMessages,
  postReply,
  openThread,
  lmQuery,
  lmCreate,
  lmTransition,
  lmRecordInfo,
  lmSearch,
  lmGet,
  search as searchTool,
  codeSearch,
  codeSearchRemote,
  extract as extractTool,
  gateway,
} from './tools/gateway.js';

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
        visibleState.definition,
        infoDelta.definition,
        pollMessages.definition,
        postReply.definition,
        openThread.definition,
        lmQuery.definition,
        lmCreate.definition,
        lmTransition.definition,
        lmRecordInfo.definition,
        lmSearch.definition,
        lmGet.definition,
        searchTool.definition,
        codeSearch.definition,
        codeSearchRemote.definition,
        extractTool.definition,
        gateway.definition,
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
        case 'visible_state':
          return await visibleState.handler(args);
        case 'info_delta':
          return await infoDelta.handler(args);
        case 'poll_messages':
          return await pollMessages.handler(args);
        case 'post_reply':
          return await postReply.handler(args);
        case 'open_thread':
          return await openThread.handler(args);
        case 'lm_query':
          return await lmQuery.handler(args);
        case 'lm_create':
          return await lmCreate.handler(args);
        case 'lm_transition':
          return await lmTransition.handler(args);
        case 'lm_record_info':
          return await lmRecordInfo.handler(args);
        case 'lm_search':
          return await lmSearch.handler(args);
        case 'lm_get':
          return await lmGet.handler(args);
        case 'search':
          return await searchTool.handler(args);
        case 'code_search':
          return await codeSearch.handler(args);
        case 'code_search_remote':
          return await codeSearchRemote.handler(args);
        case 'extract':
          return await extractTool.handler(args);
        case 'gateway':
          return await gateway.handler(args);
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
