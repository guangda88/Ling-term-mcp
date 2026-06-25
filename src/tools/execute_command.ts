/**
 * Execute Command Tool — Lingyuan V1.0 thin trunk
 *
 * Handler is now ~30 lines. All security checks, execution, and audit
 * are delegated to the CommandPipeline middlewares.
 */

import { defaultPipeline } from '../pipeline/pipeline_factory.js';
import { createCommandCtx } from '../pipeline/command_ctx.js';

export const executeCommand = {
  definition: {
    name: 'execute_command',
    description:
      'Execute terminal commands safely. Use shell=true for pipes, chaining (&&, ||), redirects, and shell builtins (cd, export, source). Use shell=false (default) for direct binary execution.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command to execute' },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: 'Args for non-shell mode',
        },
        session_id: { type: 'string', description: 'Optional session ID' },
        shell: {
          type: 'boolean',
          description: 'Execute via shell. Default: false.',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 60000, max: 600000)',
        },
        reasoning: {
          type: 'string',
          description: 'Why this command is being executed',
        },
        caller: {
          type: 'string',
          description:
            'Caller identity. Validated against the 灵族 member registry. Required.',
        },
        expected_outcome: {
          type: 'string',
          description: 'What you expect this command to produce',
        },
        authorization_id: {
          type: 'string',
          description: 'Authorization ID for red-zone commands',
        },
      },
      required: ['command', 'caller'],
    },
  },

  async handler(args: unknown) {
    const a = (args ?? {}) as Record<string, unknown>;
    if (!a['command'] || typeof a['command'] !== 'string') {
      throw new Error('Command is required and must be a string');
    }

    const ctx = createCommandCtx(a);
    await defaultPipeline.execute(ctx);

    if (ctx.rejected) {
      // Security/identity rejections throw (契约：测试期望throw)
      throw new Error(
        ctx.rejectCategory === 'red_zone' &&
          ctx.rejectReason?.startsWith('Red-zone')
          ? ctx.rejectReason
          : ctx.rejectCategory === 'unauthorized'
            ? (ctx.rejectReason ?? 'Unknown caller')
            : ctx.rejectCategory === 'authorizable'
              ? (ctx.rejectReason ??
                `Command requires authorization. Use authorize tool first.`)
              : `Security validation failed: ${ctx.rejectReason}`
      );
    }

    const r = ctx.result!;
    const success = r.exit_code === 0;
    const output =
      r.stdout || r.stderr || (success ? 'Command executed successfully' : '');

    if (success) {
      return {
        content: [{ type: 'text' as const, text: output }],
      };
    }

    // Execution failure: return isError + error_meta
    const errorCategory = r.exit_code === -1 ? 'timeout' : 'execution';
    const errorMeta = JSON.stringify({
      category: errorCategory,
      retryable: errorCategory === 'timeout' || errorCategory === 'execution',
      killed: r.exit_code === -1,
      signal: null,
    });
    return {
      content: [
        { type: 'text' as const, text: output },
        { type: 'text' as const, text: `--- error_meta ---\n${errorMeta}` },
      ],
      isError: true,
    };
  },
};
