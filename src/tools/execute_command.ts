/**
 * Execute Command Tool
 * Executes terminal commands safely
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { securityValidator } from '../security/validator.js';
import {
  withPerformanceTracking,
  performanceMonitor,
} from '../monitoring/performance.js';

const execFileAsync = promisify(execFile);

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

    // Security validation
    const securityCheck = securityValidator.validateCommand(
      command,
      cmdArgs || []
    );
    if (!securityCheck.valid) {
      throw new Error(`Security validation failed: ${securityCheck.error}`);
    }

    // Execute command with performance tracking (parameterized — no shell injection)
    try {
      const { stdout, stderr } = await withPerformanceTracking(
        command,
        async () => {
          return await execFileAsync(command, cmdArgs, {
            timeout: 60000,
            env: { ...process.env, TERM: 'xterm-256color' },
          });
        },
        performanceMonitor
      );

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
