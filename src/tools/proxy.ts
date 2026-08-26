/**
 * MCP Proxy Tool (consolidated)
 *
 * Replaces: proxy_list, proxy_call, proxy_status
 * Usage: proxy { command: 'call', backend, tool, args }  — call a tool
 *        proxy { command: 'list' }                        — list backends/tools
 *        proxy { command: 'status' }                      — show backend health
 *
 * 边界硬规则（2026-08-15 灵安议题明确）：
 * - 本文件 = 灵犀 MCP 后端代理（向 lingbus/lingmemory/lingsearch/lingcreate/lingzhi/
 *   lingresearch/lingminopt/lingyang/lingtongask 转发 MCP 工具调用）
 * - ❌ 不涉及 proxy3 模型路由（API key / 限流 / 模型路由归灵通 lingflow proxy）
 * - ❌ 不涉及 proxy 健康检查（归灵克 SDT-lc-002）
 *
 * 如需扩展模型路由/限流，请先确认是否越界 → 找灵通。
 */

import {
  listBackendTools,
  callBackendTool,
  getBackendNames,
  getAllBackendStatuses,
  getBackendStatus,
  getBackendError,
} from '../proxy/manager.js';

function json(data: unknown) {
  return JSON.stringify(data, null, 2);
}

function textResponse(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function errorResponse(message: string) {
  return {
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
    isError: true,
  };
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
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
          return errorResponse('backend is required');
        }
        if (!tool || typeof tool !== 'string') {
          return errorResponse('tool is required');
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

          return textResponse(json(result));
        } catch (err) {
          return errorResponse(
            `Error calling ${backend}.${tool}: ${errorMessage(err)}`
          );
        }
      }

      case 'list': {
        if (backend) {
          try {
            const tools = await listBackendTools(backend);
            return textResponse(
              json({
                backend,
                tool_count: tools.length,
                tools: tools.map((t) => ({
                  name: t.name,
                  description: t.description?.slice(0, 200),
                })),
              })
            );
          } catch (err) {
            return errorResponse(errorMessage(err));
          }
        }

        return textResponse(
          json({
            total_backends: getBackendNames().length,
            backends: getBackendNames().map((name) => ({
              backend: name,
              status: getBackendStatus(name),
              tool_count: null as number | null,
              error: getBackendError(name),
            })),
            usage:
              'Use proxy command "call" to invoke a specific tool on a backend.',
          })
        );
      }

      case 'status': {
        const statuses = getAllBackendStatuses();
        return textResponse(
          json({
            total: statuses.length,
            running: statuses.filter((s) => s.running).length,
            initialized: statuses.filter((s) => s.initialized).length,
            backends: statuses,
          })
        );
      }

      default:
        throw new Error(
          `Unknown proxy command: '${command}'. Valid: call, list, status`
        );
    }
  },
};
