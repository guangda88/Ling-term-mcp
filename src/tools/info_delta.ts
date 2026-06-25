/**
 * Info Delta MCP Tool — R5 v7 dual-dimension analysis interface.
 *
 * Exposes the information gain detector for 灵研 (lingresearch) R5 v7 integration.
 * Takes command pairs and returns repeat_burst × jaccard classification.
 */

import { analyzeInfoDelta } from '../monitoring/info_delta.js';
import type { CommandPair } from '../monitoring/info_delta.js';

export const infoDelta = {
  definition: {
    name: 'info_delta',
    description:
      'R5 v7 information gain analysis. Takes command execution pairs and returns ' +
      'repeat_burst × text Jaccard classification: cognitive_repeat (real degradation), ' +
      'functional_iteration (not degradation, R5 v6 misreport), rhetoric_loop (R5 v6 missed), ' +
      'or healthy.',
    inputSchema: {
      type: 'object',
      properties: {
        pairs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              command: {
                type: 'string',
                description: 'The full command string (e.g. "ls -la /tmp")',
              },
              text: {
                type: 'string',
                description: 'Command output (stdout or stderr)',
              },
            },
            required: ['command', 'text'],
          },
          description: 'Array of command-output pairs in execution order',
        },
      },
      required: ['pairs'],
    },
  },

  async handler(args: unknown) {
    const { pairs } = args as { pairs?: CommandPair[] };

    if (!pairs || !Array.isArray(pairs) || pairs.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Error: pairs array is required and must be non-empty',
          },
        ],
        isError: true,
      };
    }

    const result = analyzeInfoDelta(pairs);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
};
