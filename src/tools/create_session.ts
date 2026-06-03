/**
 * Create Session Tool
 * Creates a new terminal session
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { saveSession } from '../sessions/store.js';
import { isCwdAllowed } from '../common/command_utils.js';

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

    const resolvedDir = path.resolve(working_directory || process.cwd());

    if (!isCwdAllowed(resolvedDir)) {
      throw new Error(
        `Working directory '${resolvedDir}' is not allowed. Blocked prefixes: /etc, /root, /var, /boot, /sbin`
      );
    }

    try {
      const stat = await fs.stat(resolvedDir);
      if (!stat.isDirectory()) {
        throw new Error(`Path is not a directory: ${resolvedDir}`);
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('Path is not a directory')
      ) {
        throw error;
      }
      throw new Error(`Working directory does not exist: ${resolvedDir}`);
    }

    const sessionId = uuidv4();

    const session = {
      id: sessionId,
      name: name || `session-${sessionId.slice(0, 8)}`,
      working_directory: path.resolve(resolvedDir),
      created_at: new Date().toISOString(),
      status: 'active' as const,
    };

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
