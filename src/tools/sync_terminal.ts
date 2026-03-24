/**
 * Sync Terminal Tool
 * Synchronizes terminal state (working directory, environment variables)
 */

import * as os from 'os';

/**
 * Sync terminal tool definition
 */
export const syncTerminal = {
  definition: {
    name: 'sync_terminal',
    description: 'Synchronize terminal state (working directory, environment)',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID to sync',
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

    // Get terminal state
    const state = {
      session_id,
      working_directory: process.cwd(),
      user: process.env.USER || process.env.USERNAME || 'unknown',
      home_directory: os.homedir(),
      platform: os.platform(),
      architecture: os.arch(),
      environment: {
        PATH: process.env.PATH,
        SHELL: process.env.SHELL,
        LANG: process.env.LANG,
        HOME: process.env.HOME,
      },
      timestamp: new Date().toISOString(),
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(state, null, 2),
        },
      ],
    };
  },
};
