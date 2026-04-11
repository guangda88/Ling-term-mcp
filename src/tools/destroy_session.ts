/**
 * Destroy Session Tool
 * Destroys a terminal session and generates behavioral snapshot
 */

import {
  deleteSession,
  getSession,
  finalizeSession,
} from '../sessions/store.js';

/**
 * Destroy session tool definition
 */
export const destroySession = {
  definition: {
    name: 'destroy_session',
    description:
      'Destroy a terminal session. Generates a behavioral snapshot with decision log, behavioral violations, and outcome deviation analysis.',
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

    const session = await getSession(session_id);
    if (!session) {
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
        const withReasoning = snapshot.decision_log.filter((d) => d.reasoning);
        parts.push(
          `  With reasoning: ${withReasoning.length}/${snapshot.decision_log.length}`
        );
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: parts.join('\n'),
        },
      ],
    };
  },
};
