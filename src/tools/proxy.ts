/**
 * MCP Proxy Tool (consolidated)
 *
 * Replaces: proxy_list, proxy_call, proxy_status
 * Usage: proxy { command: 'call', backend, tool, args }  — call a tool
 *        proxy { command: 'list' }                        — list backends/tools
 *        proxy { command: 'status' }                      — show backend health
 */

import {
  listBackendTools,
  callBackendTool,
  getBackendNames,
  getAllBackendStatuses,
  getBackendStatus,
} from '../proxy/manager.js';

function json(data: unknown) {
  return JSON.stringify(data, null, 2);
}

export const proxy = {
  definition: {
    name: 'proxy',
    description:
      'MCP proxy: call tools on proxied backends (lingcreate/lingzhi/lingresearch/lingminopt/lingyang/lingtongask). Commands: call (call a tool), list (list backends/tools), status (backend health).',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          enum: ['call', 'list', 'status'],
          description:
            'Proxy operation: call (invoke tool), list (discover tools), status (health check)',
        },
        backend: {
          type: 'string',
          description:
            'Backend name (required for call; optional for list to filter)',
        },
        tool: {
          type: 'string',
          description: 'Tool name to call on the backend (required for call)',
        },
        args: {
          type: 'object',
          description: 'Arguments to pass to the tool (optional, for call)',
          additionalProperties: true,
        },
      },
      required: ['command'],
    },
  },

  async handler(args: unknown) {
    const {
      command,
      backend,
      tool,
      args: toolArgs = {},
    } = args as {
      command: string;
      backend?: string;
      tool?: string;
      args?: Record<string, unknown>;
    };

    switch (command) {
      case 'call': {
        if (!backend || typeof backend !== 'string') {
          return {
            content: [
              { type: 'text' as const, text: 'Error: backend is required' },
            ],
            isError: true,
          };
        }
        if (!tool || typeof tool !== 'string') {
          return {
            content: [
              { type: 'text' as const, text: 'Error: tool is required' },
            ],
            isError: true,
          };
        }

        try {
          const result = (await callBackendTool(backend, tool, toolArgs)) as {
            content?: Array<{ type: string; text?: string }>;
            isError?: boolean;
          };

          if (result?.content) {
            return {
              content: result.content.map((c) => ({
                type: c.type as 'text',
                text: c.text || '',
              })),
              isError: result.isError || false,
            };
          }

          return {
            content: [{ type: 'text' as const, text: json(result) }],
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error calling ${backend}.${tool}: ${msg}`,
              },
            ],
            isError: true,
          };
        }
      }

      case 'list': {
        if (backend) {
          try {
            const tools = await listBackendTools(backend);
            return {
              content: [
                {
                  type: 'text' as const,
                  text: json({
                    backend,
                    tool_count: tools.length,
                    tools: tools.map((t) => ({
                      name: t.name,
                      description: t.description?.slice(0, 200),
                    })),
                  }),
                },
              ],
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
              content: [{ type: 'text' as const, text: `Error: ${msg}` }],
              isError: true,
            };
          }
        }

        const names = getBackendNames();
        const results: Array<{
          backend: string;
          status: ReturnType<typeof getBackendStatus>;
          tool_count: number | null;
          error: string | null;
        }> = [];

        for (const name of names) {
          const status = getBackendStatus(name);
          let toolCount: number | null = null;
          let error: string | null = null;

          try {
            const tools = await listBackendTools(name);
            toolCount = tools.length;
          } catch (err) {
            error = err instanceof Error ? err.message : String(err);
          }

          results.push({
            backend: name,
            status,
            tool_count: toolCount,
            error,
          });
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: json({
                total_backends: results.length,
                backends: results,
                usage:
                  'Use proxy command "call" to invoke a specific tool on a backend.',
              }),
            },
          ],
        };
      }

      case 'status': {
        const statuses = getAllBackendStatuses();
        return {
          content: [
            {
              type: 'text' as const,
              text: json({
                total: statuses.length,
                running: statuses.filter((s) => s.running).length,
                initialized: statuses.filter((s) => s.initialized).length,
                backends: statuses,
              }),
            },
          ],
        };
      }

      default:
        throw new Error(
          `Unknown proxy command: '${command}'. Valid: call, list, status`
        );
    }
  },
};
