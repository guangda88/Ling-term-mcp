/**
 * Execute Command Tool
 * Executes terminal commands safely
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Execute command tool definition
 */
export const executeCommand = {
  definition: {
    name: 'execute_command',
    description: 'Execute terminal commands safely',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The command to execute',
        },
        args: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Command arguments',
        },
        session_id: {
          type: 'string',
          description: 'Optional session ID for execution context',
        },
      },
      required: ['command'],
    },
  },

  async handler(args: unknown) {
    const { command, args: cmdArgs = [] } = args as {
      command: string;
      args?: string[];
      session_id?: string;
    };

    // Validate command
    if (!command || typeof command !== 'string') {
      throw new Error('Command is required and must be a string');
    }

    // Build full command
    const fullCommand = cmdArgs.length > 0 ? [command, ...cmdArgs].join(' ') : command;

    // Execute command
    try {
      const { stdout, stderr } = await execAsync(fullCommand, {
        timeout: 60000, // 60 second timeout
        env: { ...process.env, TERM: 'xterm-256color' },
      });

      const output = stdout || stderr || 'Command executed successfully';

      return {
        content: [
          {
            type: 'text',
            text: output,
          },
        ],
      };
    } catch (error) {
      const err = error as { message?: string; stderr?: string };
      const errorMessage = err.message || 'Command execution failed';
      const errorOutput = err.stderr || '';

      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}\n${errorOutput}`,
          },
        ],
        isError: true,
      };
    }
  },
};
