/**
 * Create Session Tool
 * Creates a new terminal session
 */

import { v4 as uuidv4 } from 'uuid';
import { saveSession } from '../sessions/store.js';

/**
 * Create session tool definition
 */
export const createSession = {
  definition: {
    name: 'create_session',
    description: 'Create a new terminal session',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Session name',
        },
        working_directory: {
          type: 'string',
          description: 'Working directory for the session',
        },
      },
    },
  },

  async handler(args: unknown) {
    const { name, working_directory } = args as {
      name?: string;
      working_directory?: string;
    };

    // Generate session ID
    const sessionId = uuidv4();

    // Create session
    const session = {
      id: sessionId,
      name: name || `session-${sessionId.slice(0, 8)}`,
      working_directory: working_directory || process.cwd(),
      created_at: new Date().toISOString(),
      status: 'active' as const,
    };

    // Save session
    await saveSession(session);

    return {
      content: [
        {
          type: 'text',
          text: `Session created successfully:\n\n${JSON.stringify(session, null, 2)}`,
        },
      ],
    };
  },
};
