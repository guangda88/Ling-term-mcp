/**
 * List Sessions Tool
 * Lists all active sessions
 */

import { getSessions } from '../sessions/store.js';

/**
 * List sessions tool definition
 */
export const listSessions = {
  definition: {
    name: 'list_sessions',
    description: 'List all active terminal sessions',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  async handler() {
    const sessions = await getSessions();

    if (sessions.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No active sessions found',
          },
        ],
      };
    }

    const sessionList = sessions.map((session) => ({
      id: session.id,
      name: session.name,
      created_at: session.created_at,
      status: session.status,
      working_directory: session.working_directory,
    }));

    return {
      content: [
        {
          type: 'text',
          text: `Found ${sessions.length} active session(s):\n\n${JSON.stringify(
            sessionList,
            null,
            2
          )}`,
        },
      ],
    };
  },
};
