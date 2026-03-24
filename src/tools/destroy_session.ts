/**
 * Destroy Session Tool
 * Destroys a terminal session
 */

import { deleteSession, getSession } from '../sessions/store.js';

/**
 * Destroy session tool definition
 */
export const destroySession = {
  definition: {
    name: 'destroy_session',
    description: 'Destroy a terminal session',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID to destroy',
        },
      },
      required: ['session_id'],
    },
  },

  async handler(args: unknown) {
    const { session_id } = args as { session_id: string };

    if (!session_id || typeof session_id !== 'string') {
      throw new Error('Session ID is required and must be a string');
    }

    // Check if session exists
    const session = await getSession(session_id);
    if (!session) {
      throw new Error(`Session not found: ${session_id}`);
    }

    // Delete session
    await deleteSession(session_id);

    return {
      content: [
        {
          type: 'text',
          text: `Session destroyed successfully: ${session_id}`,
        },
      ],
    };
  },
};
