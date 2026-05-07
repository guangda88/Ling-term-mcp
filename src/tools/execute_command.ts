/**
 * Execute Command Tool
 * Executes terminal commands safely with shell and non-shell modes
 */

import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { securityValidator } from '../security/validator.js';
import { SourceType } from '@ling/protocol';
import { isKnownMember, getMember } from '../security/identity.js';
import {
  withPerformanceTracking,
  performanceMonitor,
} from '../monitoring/performance.js';
import {
  getSession,
  updateSession,
  appendCommandHistory,
  appendDecisionRecord,
} from '../sessions/store.js';
import { hashOutput } from '../audit/snapshot.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const BLOCKED_ENV_RE =
  /SECRET|PASSWORD|TOKEN|API_KEY|PRIVATE_KEY|AUTH|CREDENTIAL|ACCESS_KEY/i;

const SESSION_ENV_BLOCKLIST = new Set([
  'PATH',
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'SHELL',
  'HOME',
  'USER',
  'IFS',
  'ENV',
  'BASH_ENV',
  'NODE_OPTIONS',
  'PYTHONSTARTUP',
  'PYTHONPATH',
  'PYTHONINSPECT',
  'GIT_EXEC_PATH',
  'RUBYOPT',
  'PERL5LIB',
  'PERL5OPT',
  'LD_AUDIT',
  'MALLOC_CHECK_',
  'GCONV_PATH',
  'BASH_FUNC_',
]);

const BLOCKED_CWD_PREFIXES = ['/etc', '/root', '/var', '/boot', '/sbin'];

function isCwdAllowed(resolvedPath: string): boolean {
  for (const prefix of BLOCKED_CWD_PREFIXES) {
    if (resolvedPath.startsWith(prefix + '/') || resolvedPath === prefix) {
      return false;
    }
  }
  return true;
}

const DEFAULT_TIMEOUT = 60000;
const MAX_TIMEOUT = 600000;
const MAX_OUTPUT_LENGTH = 10000;
const OUTPUT_HEAD = 5000;
const OUTPUT_TAIL = 5000;

function buildSafeEnv(sessionEnv?: Record<string, string>): NodeJS.ProcessEnv {
  const safeEnv: NodeJS.ProcessEnv = { TERM: 'xterm-256color' };
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    const isBlocked = BLOCKED_ENV_RE.test(key);
    if (!isBlocked) {
      safeEnv[key] = value;
    }
  }
  if (sessionEnv) {
    for (const [key, value] of Object.entries(sessionEnv)) {
      if (SESSION_ENV_BLOCKLIST.has(key)) continue;
      if (BLOCKED_ENV_RE.test(key)) continue;
      safeEnv[key] = value;
    }
  }
  return safeEnv;
}

function truncateOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_LENGTH) {
    return output;
  }
  const head = output.slice(0, OUTPUT_HEAD);
  const tail = output.slice(-OUTPUT_TAIL);
  const omitted = output.length - OUTPUT_HEAD - OUTPUT_TAIL;
  return `${head}\n\n... [${omitted} characters omitted] ...\n\n${tail}`;
}

function parseCdTarget(command: string): string | null {
  const match = command.match(/^\s*cd\s+([^;&|]+)/);
  if (!match) return null;
  const target = match[1].trim();
  if (/\$\(|`|\\|\n/.test(target)) return null;
  return target;
}

function parseExports(command: string): Record<string, string> | null {
  const exports: Record<string, string> = {};
  const exportRegex =
    /export\s+([A-Za-z_][A-Za-z0-9_]*)=(?:"([^"]*)"|'([^']*)'|([^'";\s&|]+))/g;
  let found = false;
  let match;
  while ((match = exportRegex.exec(command)) !== null) {
    exports[match[1]] = match[2] ?? match[3] ?? match[4] ?? '';
    found = true;
  }
  return found ? exports : null;
}

/**
 * Execute command tool definition
 */
export const executeCommand = {
  definition: {
    name: 'execute_command',
    description:
      'Execute terminal commands safely. Use shell=true for pipes, chaining (&&, ||), redirects, and shell builtins (cd, export, source). Use shell=false (default) for direct binary execution.',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description:
            'The command to execute. When shell=true, this is the full shell command string. When shell=false, this is the binary name.',
        },
        args: {
          type: 'array',
          items: {
            type: 'string',
          },
          description:
            'Command arguments (only used when shell=false). Ignored when shell=true.',
        },
        session_id: {
          type: 'string',
          description:
            'Optional session ID for execution context (uses session working directory and environment)',
        },
        shell: {
          type: 'boolean',
          description:
            'Execute via shell (/bin/sh -c). Enables pipes, chaining, builtins (cd, export). Default: false.',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 60000, max: 600000).',
        },
        reasoning: {
          type: 'string',
          description:
            'Why this command is being executed (decision provenance).',
        },
        caller: {
          type: 'string',
          description:
            "Caller identity (e.g. 'lingflow', 'lingclaude'). Validated against the 灵族 member registry. Optional but recommended.",
        },
        expected_outcome: {
          type: 'string',
          description: 'What you expect this command to produce or return.',
        },
      },
      required: ['command'],
    },
  },

  async handler(args: unknown) {
    const {
      command,
      args: cmdArgs = [],
      session_id,
      shell = false,
      timeout,
      reasoning = '',
      expected_outcome = '',
      caller,
    } = args as {
      command: string;
      args?: string[];
      session_id?: string;
      shell?: boolean;
      timeout?: number;
      reasoning?: string;
      expected_outcome?: string;
      caller?: string;
    };

    if (!command || typeof command !== 'string') {
      throw new Error('Command is required and must be a string');
    }

    if (caller !== undefined) {
      if (!isKnownMember(caller)) {
        throw new Error(
          `Unknown caller: '${caller}' is not a registered 灵族 member`
        );
      }
    } else {
      console.error(
        `[identity] Warning: execute_command called without caller identity for: ${command}`
      );
    }

    const effectiveTimeout = Math.min(
      Math.max(timeout || DEFAULT_TIMEOUT, 1000),
      MAX_TIMEOUT
    );

    const securityCheck = securityValidator.validateCommand(
      command,
      shell ? [] : cmdArgs || [],
      shell
    );
    if (!securityCheck.valid) {
      throw new Error(`Security validation failed: ${securityCheck.error}`);
    }

    let cwd: string | undefined;
    let sessionEnv: Record<string, string> | undefined;
    if (session_id) {
      const session = await getSession(session_id);
      if (!session) {
        throw new Error(`Session not found: ${session_id}`);
      }
      cwd = session.working_directory;
      sessionEnv = session.environment;
    }

    const execEnv = buildSafeEnv(sessionEnv);

    try {
      const result = await withPerformanceTracking(
        command,
        async () => {
          if (shell) {
            return await execAsync(command, {
              timeout: effectiveTimeout,
              env: execEnv,
              cwd,
              maxBuffer: 1024 * 1024,
            });
          } else {
            return await execFileAsync(command, cmdArgs, {
              timeout: effectiveTimeout,
              env: execEnv,
              cwd,
              maxBuffer: 1024 * 1024,
            });
          }
        },
        performanceMonitor
      );

      const rawOutput =
        result.stdout || result.stderr || 'Command executed successfully';
      const output = truncateOutput(rawOutput);

      if (session_id && shell) {
        const cdTarget = parseCdTarget(command);
        if (cdTarget && cwd) {
          const newCwd = path.resolve(cwd, cdTarget);
          if (!isCwdAllowed(newCwd)) {
            console.error(`[security] cd to blocked path rejected: ${newCwd}`);
          } else {
            await updateSession(session_id, { working_directory: newCwd });
          }
        }

        const exports = parseExports(command);
        if (exports) {
          const session = await getSession(session_id);
          const existingEnv = session?.environment || {};
          await updateSession(session_id, {
            environment: { ...existingEnv, ...exports },
          });
        }
      }

      if (session_id) {
        const fullCmd = shell ? command : [command, ...cmdArgs].join(' ');
        appendCommandHistory(session_id, fullCmd).catch((e) =>
          console.error('[audit] appendCommandHistory failed:', e)
        );

        const outputHash = hashOutput(rawOutput);
        const sourceTrace = caller
          ? [
              {
                type: SourceType.VERIFIED,
                timestamp: new Date().toISOString(),
                origin: caller,
                confidence: 1.0,
                metadata: getMember(caller)
                  ? { role: getMember(caller)!.role }
                  : undefined,
              },
            ]
          : undefined;
        appendDecisionRecord(session_id, {
          timestamp: new Date().toISOString(),
          command: fullCmd,
          reasoning,
          expected_outcome,
          actual_outcome_hash: outputHash,
          success: true,
          session_id,
          source_trace: sourceTrace,
        }).catch((e) =>
          console.error('[audit] appendDecisionRecord failed:', e)
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: output,
          },
        ],
      };
    } catch (error) {
      const err = error as {
        message?: string;
        stderr?: string;
        stdout?: string;
        code?: string;
        killed?: boolean;
        signal?: string;
      };

      const combined = [
        err.stdout,
        err.stderr,
        err.message || 'Command execution failed',
      ]
        .filter(Boolean)
        .join('\n');

      const errorCategory = err.killed
        ? 'timeout'
        : err.code === 'ENOENT'
          ? 'not_found'
          : err.signal
            ? 'signal'
            : 'execution';

      if (session_id) {
        const fullCmd = shell ? command : [command, ...cmdArgs].join(' ');
        appendDecisionRecord(session_id, {
          timestamp: new Date().toISOString(),
          command: fullCmd,
          reasoning,
          expected_outcome,
          actual_outcome_hash: hashOutput(combined),
          success: false,
          session_id,
          source_trace: caller
            ? [
                {
                  type: SourceType.VERIFIED,
                  timestamp: new Date().toISOString(),
                  origin: caller,
                  confidence: 1.0,
                },
              ]
            : undefined,
        }).catch((e) =>
          console.error('[audit] appendDecisionRecord failed:', e)
        );
      }

      const errorMeta = JSON.stringify({
        category: errorCategory,
        retryable: errorCategory === 'timeout' || errorCategory === 'execution',
        killed: err.killed ?? false,
        signal: err.signal ?? null,
      });

      return {
        content: [
          {
            type: 'text',
            text: truncateOutput(combined),
          },
          {
            type: 'text',
            text: `--- error_meta ---\n${errorMeta}`,
          },
        ],
        isError: true,
      };
    }
  },
};
