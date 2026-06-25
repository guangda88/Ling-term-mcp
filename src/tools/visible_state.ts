/**
 * Visible State Tool — security visibility for the visible_gate (7th dimension).
 *
 * Returns security metrics that let the 灵族 see command-safety state.
 *灵网's /api/visible aggregation panel can query this via MCP or HTTP.
 */

import { getSecurityVisibility } from '../audit/rejection_log.js';
import { getEffectiveLists } from '../security/validator.js';

export const visibleState = {
  definition: {
    name: 'visible_state',
    description:
      'Get security visibility metrics (7th dimension of visible_gate). ' +
      'Returns today_rejections, redzone_intercept_rate, by_category, ' +
      'top_blocked_callers, and current command classification lists.',
    inputSchema: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          enum: ['summary', 'detailed'],
          description: 'Report format. Default: summary.',
        },
      },
    },
  },

  async handler(args: unknown) {
    const a = (args ?? {}) as Record<string, unknown>;
    const format = (a['format'] as string) || 'summary';
    const sec = getSecurityVisibility();

    if (format === 'summary') {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                dimension: 'security',
                member: 'lingxi',
                today_rejections: sec.today_rejections,
                redzone_intercept_rate: sec.redzone_intercept_rate,
                by_category: sec.by_category,
                timestamp: new Date().toISOString(),
              },
              null,
              2
            ),
          },
        ],
      };
    }

    const lists = getEffectiveLists();
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              dimension: 'security',
              member: 'lingxi',
              metrics: sec,
              lists: {
                whitelist_count: lists.whitelist.length,
                blacklist_count: lists.blacklist.length,
                authorizable_count: lists.authorizable.length,
                red_zone_count: lists.red_zone.length,
                authorizable_commands: lists.authorizable,
              },
              timestamp: new Date().toISOString(),
            },
            null,
            2
          ),
        },
      ],
    };
  },
};
