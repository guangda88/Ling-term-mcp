/**
 * Gateway Tools — Unified MCP tool proxy
 *
 * Replaces separate lingbus/lingmemory/lingsearch MCP connections
 * with first-class tools inside ling-term-mcp.
 *
 * Backend URLs:
 *   lingbus    → http://127.0.0.1:9528/mcp
 *   lingmemory → http://127.0.0.1:9530/mcp
 *   lingsearch → http://127.0.0.1:9540/mcp
 */

import { callMcpTool } from '../lib/mcp_client.js';

const LINGBUS = 'http://127.0.0.1:9528/mcp';
const LINGMEMORY = 'http://127.0.0.1:9530/mcp';
const LINGSEARCH = 'http://127.0.0.1:9540/mcp';

async function mcpResult(result: Array<{ type: string; text?: string }>) {
  return { content: result };
}

// ─── LingBus Tools ────────────────────────────────────────────────

export const pollMessages = {
  definition: {
    name: 'poll_messages',
    description: '轮询接收者的新消息。',
    inputSchema: {
      type: 'object',
      properties: {
        recipient: { type: 'string', description: '消息接收者' },
        channels: { type: 'string', description: '频道过滤（可选）' },
        since_rowid: { type: 'number', description: '起始 rowid（可选）' },
        limit: { type: 'number', description: '最大返回数（可选，默认 100）' },
      },
      required: ['recipient'],
    },
  },
  async handler(args: unknown) {
    const result = await callMcpTool(
      LINGBUS,
      'poll_messages',
      args as Record<string, unknown>
    );
    return mcpResult(result);
  },
};

export const postReply = {
  definition: {
    name: 'post_reply',
    description: '在消息总线中回复线程。',
    inputSchema: {
      type: 'object',
      properties: {
        thread_id: {
          type: 'string',
          description: '线程 ID（请从 poll_messages 返回值中复制，不要手敲）',
        },
        sender: { type: 'string', description: '发送者' },
        recipient: { type: 'string', description: '接收者' },
        body: { type: 'string', description: '消息内容' },
        subject: { type: 'string', description: '主题（可选）' },
      },
      required: ['thread_id', 'sender', 'recipient', 'body'],
    },
  },
  async handler(args: unknown) {
    const { thread_id } = args as Record<string, string>;
    try {
      const result = await callMcpTool(
        LINGBUS,
        'post_reply',
        args as Record<string, unknown>
      );
      return mcpResult(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found') && thread_id) {
        return {
          content: [
            {
              type: 'text',
              text:
                `thread_id "${thread_id}" 不存在。` +
                ` 请从 poll_messages 返回值中复制 thread_id，不要手敲。` +
                ` 执行 poll_messages(recipient="lingxi") 查看当前可用线程。`,
            },
          ],
          isError: true,
        };
      }
      throw err;
    }
  },
};

export const openThread = {
  definition: {
    name: 'open_thread',
    description: '在消息总线中创建新线程。',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: '主题' },
        sender: { type: 'string', description: '发送者' },
        recipients: { type: 'string', description: '接收者列表' },
        body: { type: 'string', description: '消息内容（可选）' },
        channel: {
          type: 'string',
          description: '频道（可选，默认 ecosystem）',
        },
        subject: { type: 'string', description: '标题（可选）' },
      },
      required: ['topic', 'sender', 'recipients'],
    },
  },
  async handler(args: unknown) {
    const result = await callMcpTool(
      LINGBUS,
      'open_thread',
      args as Record<string, unknown>
    );
    return mcpResult(result);
  },
};

// ─── LingMemory Tools ─────────────────────────────────────────────

export const lmQuery = {
  definition: {
    name: 'lm_query',
    description: '检索 records（游标分页）',
    inputSchema: {
      type: 'object',
      properties: {
        member: { type: 'string', description: '成员名' },
        type: { type: 'string', description: '类型过滤（可选）' },
        state: { type: 'string', description: '状态过滤（可选）' },
        created_by: { type: 'string', description: '创建者过滤（可选）' },
        parent_id: { type: 'string', description: '父记录 ID（可选）' },
        cursor: { type: 'number', description: '游标（可选，默认 0）' },
        limit: { type: 'number', description: '最大返回数（可选，默认 20）' },
      },
      required: ['member'],
    },
  },
  async handler(args: unknown) {
    const result = await callMcpTool(
      LINGMEMORY,
      'lm_query',
      args as Record<string, unknown>
    );
    return mcpResult(result);
  },
};

export const lmCreate = {
  definition: {
    name: 'lm_create',
    description: '创建一条 record',
    inputSchema: {
      type: 'object',
      properties: {
        member: { type: 'string', description: '成员名' },
        type: { type: 'string', description: '记录类型' },
        data: { type: 'string', description: '记录数据（JSON 字符串）' },
        parent_id: { type: 'string', description: '父记录 ID（可选）' },
      },
      required: ['member', 'type', 'data'],
    },
  },
  async handler(args: unknown) {
    const result = await callMcpTool(
      LINGMEMORY,
      'lm_create',
      args as Record<string, unknown>
    );
    return mcpResult(result);
  },
};

export const lmTransition = {
  definition: {
    name: 'lm_transition',
    description: '状态流转',
    inputSchema: {
      type: 'object',
      properties: {
        member: { type: 'string', description: '成员名' },
        record_id: { type: 'string', description: '记录 ID' },
        event_type: { type: 'string', description: '事件类型' },
        data: { type: 'string', description: '额外数据（JSON 字符串，可选）' },
      },
      required: ['member', 'record_id', 'event_type'],
    },
  },
  async handler(args: unknown) {
    const result = await callMcpTool(
      LINGMEMORY,
      'lm_transition',
      args as Record<string, unknown>
    );
    return mcpResult(result);
  },
};

export const lmRecordInfo = {
  definition: {
    name: 'lm_record_info',
    description: '记录一条持久化信息',
    inputSchema: {
      type: 'object',
      properties: {
        member: { type: 'string', description: '成员名' },
        content: { type: 'string', description: '信息内容' },
        info_type: {
          type: 'string',
          description: '信息类型（可选，默认 conclusion）',
        },
        is_conclusion: { type: 'boolean', description: '是否为结论（可选）' },
        retain: { type: 'boolean', description: '是否保留（可选）' },
        visibility: {
          type: 'string',
          description: '可见性（可选，默认 private）',
        },
        parent_id: { type: 'string', description: '父记录 ID（可选）' },
      },
      required: ['member', 'content'],
    },
  },
  async handler(args: unknown) {
    const result = await callMcpTool(
      LINGMEMORY,
      'lm_record_info',
      args as Record<string, unknown>
    );
    return mcpResult(result);
  },
};

export const lmSearch = {
  definition: {
    name: 'lm_search',
    description: '全文搜索 info 内容',
    inputSchema: {
      type: 'object',
      properties: {
        member: { type: 'string', description: '成员名' },
        keyword: { type: 'string', description: '搜索关键词' },
        limit: { type: 'number', description: '最大返回数（可选，默认 20）' },
      },
      required: ['member', 'keyword'],
    },
  },
  async handler(args: unknown) {
    const result = await callMcpTool(
      LINGMEMORY,
      'lm_search',
      args as Record<string, unknown>
    );
    return mcpResult(result);
  },
};

export const lmGet = {
  definition: {
    name: 'lm_get',
    description: '取单条 record',
    inputSchema: {
      type: 'object',
      properties: {
        member: { type: 'string', description: '成员名' },
        record_id: { type: 'string', description: '记录 ID' },
      },
      required: ['member', 'record_id'],
    },
  },
  async handler(args: unknown) {
    const result = await callMcpTool(
      LINGMEMORY,
      'lm_get',
      args as Record<string, unknown>
    );
    return mcpResult(result);
  },
};

// ─── LingSearch Tools ─────────────────────────────────────────────

export const codeSearch = {
  definition: {
    name: 'code_search',
    description:
      '全族源码项目搜索：行号+上下文+项目/语言过滤。query=搜索词,project=项目名(如lingxi,空=全部),language=python/typescript/go等(空=全部代码文件),regex=是否正则(默认false),context=上下文行数(默认3),max_results=最大结果数(默认20)。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索模式（字面或正则）' },
        project: {
          type: 'string',
          description: '项目名过滤（如 lingxi/lingflow，空=全部项目）',
        },
        language: {
          type: 'string',
          description:
            '语言过滤（python/typescript/go/rust/java/c/cpp/shell/yaml/json/markdown/html/css/sql，空=全部）',
        },
        regex: { type: 'boolean', description: '是否正则模式（默认 false）' },
        context: {
          type: 'number',
          description: '上下文行数（默认 3，0=只返回匹配行）',
        },
        max_results: {
          type: 'number',
          description: '最大结果数（默认 20）',
        },
      },
      required: ['query'],
    },
  },
  async handler(args: unknown) {
    const result = await callMcpTool(
      LINGSEARCH,
      'code_search',
      args as Record<string, unknown>
    );
    return mcpResult(result);
  },
};

export const codeSearchRemote = {
  definition: {
    name: 'code_search_remote',
    description:
      '远程开源项目搜索(Sourcegraph)：搜公开GitHub仓库代码。query=搜索模式(支持Sourcegraph语法:lang:/repo:/file:/count:),language=语言快捷(python/typescript/go等),repo=仓库过滤(如github.com/torvalds/linux),file_pattern=文件路径过滤,count=最大结果数(默认10)。无需认证。',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索模式（正则，支持 Sourcegraph 语法）',
        },
        language: {
          type: 'string',
          description: '语言快捷过滤（python/typescript/go/rust/java/...）',
        },
        repo: {
          type: 'string',
          description: '仓库过滤（如 github.com/torvalds/linux）',
        },
        file_pattern: {
          type: 'string',
          description: '文件路径过滤（如 *.test.ts）',
        },
        count: {
          type: 'number',
          description: '最大结果数（默认 10）',
        },
      },
      required: ['query'],
    },
  },
  async handler(args: unknown) {
    const result = await callMcpTool(
      LINGSEARCH,
      'code_search_remote',
      args as Record<string, unknown>
    );
    return mcpResult(result);
  },
};

export const search = {
  definition: {
    name: 'search',
    description:
      '灵族统一搜索：内外自动分流。source=auto(默认)/internal/external。自动附带语义相关rule。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索查询' },
        source: {
          type: 'string',
          description: '搜索源（auto/internal/external，可选，默认 auto）',
        },
        domain: { type: 'string', description: '垂直域过滤（可选）' },
        max_results: {
          type: 'number',
          description: '最大结果数（可选，默认 5）',
        },
      },
      required: ['query'],
    },
  },
  async handler(args: unknown) {
    const result = await callMcpTool(
      LINGSEARCH,
      'search',
      args as Record<string, unknown>
    );
    return mcpResult(result);
  },
};

export const extract = {
  definition: {
    name: 'extract',
    description: 'URL→Markdown正文（内部fetch优先，失败回退AnySearch）',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '要提取的 URL' },
      },
      required: ['url'],
    },
  },
  async handler(args: unknown) {
    const result = await callMcpTool(
      LINGSEARCH,
      'extract',
      args as Record<string, unknown>
    );
    return mcpResult(result);
  },
};

// ─── Generic Gateway ──────────────────────────────────────────────

export const gateway = {
  definition: {
    name: 'gateway',
    description:
      '通用 MCP 网关：调用 lingbus/lingmemory/lingsearch 上的任意工具。仅用于极少使用的操作。常用操作有专用工具（poll_messages/post_reply/lm_query/lm_create/search 等）。',
    inputSchema: {
      type: 'object',
      properties: {
        service: {
          type: 'string',
          enum: ['lingbus', 'lingmemory', 'lingsearch'],
          description: '目标服务',
        },
        tool: {
          type: 'string',
          description: '工具名称（如 ack_message, lm_db_stats, batch_search）',
        },
        args: {
          type: 'object',
          description: '工具参数',
          additionalProperties: true,
        },
      },
      required: ['service', 'tool'],
    },
  },
  async handler(args: unknown) {
    const {
      service,
      tool,
      args: toolArgs = {},
    } = args as {
      service: string;
      tool: string;
      args?: Record<string, unknown>;
    };

    const urls: Record<string, string> = {
      lingbus: LINGBUS,
      lingmemory: LINGMEMORY,
      lingsearch: LINGSEARCH,
    };

    const url = urls[service];
    if (!url) {
      return {
        content: [
          { type: 'text' as const, text: `Unknown service: ${service}` },
        ],
        isError: true,
      };
    }

    try {
      const result = await callMcpTool(url, tool, toolArgs);
      return { content: result };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text' as const, text: `Error: ${msg}` }],
        isError: true,
      };
    }
  },
};
