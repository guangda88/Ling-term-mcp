/**
 * Consolidated Session Tool
 * Replaces: list_sessions, create_session, destroy_session, sync_terminal
 * Usage: session { command: "list"|"create"|"destroy"|"sync", ... }
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import {
  getSessions,
  getSession,
  saveSession,
  deleteSession,
  finalizeSession,
} from '../sessions/store.js';
import { isCwdAllowed } from '../common/command_utils.js';

function json(data: unknown) {
  return JSON.stringify(data, null, 2);
}

export const session = {
  definition: {
    name: 'session',
    description:
      'Manage terminal sessions. Commands: list (list all), create (create new), destroy (destroy + behavioral snapshot), sync (sync terminal state).',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          enum: ['list', 'create', 'destroy', 'sync'],
          description: 'Session operation to perform',
        },
        session_id: {
          type: 'string',
          description:
            'Session ID (required for destroy, sync; optional for create)',
        },
        name: {
          type: 'string',
          description: 'Session name (optional, for create)',
        },
        working_directory: {
          type: 'string',
          description: 'Working directory (optional, for create)',
        },
      },
      required: ['command'],
    },
  },

  async handler(args: unknown) {
    const { command, session_id, name, working_directory } = args as {
      command: string;
      session_id?: string;
      name?: string;
      working_directory?: string;
    };

    switch (command) {
      case 'list': {
        const sessions = await getSessions();
        if (sessions.length === 0) {
          return {
            content: [
              { type: 'text' as const, text: 'No active sessions found' },
            ],
          };
        }
        return {
          content: [
            {
              type: 'text' as const,
              text: `Found ${sessions.length} active session(s):\n\n${json(
                sessions.map((s) => ({
                  id: s.id,
                  name: s.name,
                  created_at: s.created_at,
                  status: s.status,
                  working_directory: s.working_directory,
                }))
              )}`,
            },
          ],
        };
      }

      case 'create': {
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
              type: 'text' as const,
              text: `Session created successfully:\n\n${json(session)}`,
            },
          ],
        };
      }

      case 'destroy': {
        if (!session_id || typeof session_id !== 'string') {
          throw new Error('Session ID is required for destroy');
        }

        const sess = await getSession(session_id);
        if (!sess) {
          throw new Error(`Session not found: ${session_id}`);
        }

        const snapshot = await finalizeSession(session_id);
        await deleteSession(session_id);

        const parts = [`Session destroyed successfully: ${session_id}`];

        if (snapshot) {
          parts.push('');
          parts.push('--- Session Behavioral Snapshot ---');
          parts.push(`Duration: ${snapshot.duration_seconds}s`);
          parts.push(`Commands executed: ${snapshot.commands_executed}`);
          parts.push(
            `Outcome deviation rate: ${(snapshot.outcome_deviation_rate * 100).toFixed(1)}%`
          );
          parts.push(
            `Directories accessed: ${snapshot.directories_accessed.length}`
          );
          parts.push(`Network commands: ${snapshot.network_commands.length}`);

          if (snapshot.behavioral_violations.length > 0) {
            parts.push('');
            parts.push(
              `⚠ Behavioral violations: ${snapshot.behavioral_violations.length}`
            );
            for (const v of snapshot.behavioral_violations) {
              parts.push(`  - [${v.rule}] ${v.message}`);
            }
          }

          if (snapshot.decision_log.length > 0) {
            parts.push('');
            parts.push(`Decision records: ${snapshot.decision_log.length}`);
            const withReasoning = snapshot.decision_log.filter(
              (d) => d.reasoning
            );
            parts.push(
              `  With reasoning: ${withReasoning.length}/${snapshot.decision_log.length}`
            );
          }
        }

        return {
          content: [{ type: 'text' as const, text: parts.join('\n') }],
        };
      }

      case 'sync': {
        if (!session_id || typeof session_id !== 'string') {
          throw new Error('Session ID is required for sync');
        }

        const sess = await getSession(session_id);
        if (!sess) {
          throw new Error(`Session not found: ${session_id}`);
        }

        const state = {
          session_id,
          working_directory: sess.working_directory,
          environment: sess.environment || {},
          command_history: sess.command_history || [],
          user: process.env.USER || process.env.USERNAME || 'unknown',
          home_directory: os.homedir(),
          platform: os.platform(),
          architecture: os.arch(),
          system_info: {
            PATH: process.env.PATH,
            SHELL: process.env.SHELL,
            LANG: process.env.LANG,
            HOME: process.env.HOME,
          },
          timestamp: new Date().toISOString(),
        };

        return {
          content: [{ type: 'text' as const, text: json(state) }],
        };
      }

      default:
        throw new Error(
          `Unknown session command: '${command}'. Valid: list, create, destroy, sync`
        );
    }
  },
};
