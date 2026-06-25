/**
 * Command Executor Middleware
 * Forks and executes the command via child_process.
 * This is the only middleware that produces side effects.
 */

import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import type { ForwardFn } from '../pipeline/middleware.js';
import { buildSafeEnv } from '../middleware/env_builder.js';
import { getSession, updateSession } from '../sessions/store.js';
import {
  DEFAULT_TIMEOUT,
  MAX_TIMEOUT,
  isCwdAllowed,
  truncateOutput,
} from '../common/command_utils.js';
import { sanitizeOutput } from '../middleware/output_sanitizer.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

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

export const commandExecutor: ForwardFn = async (ctx) => {
  const effectiveTimeout = Math.min(
    Math.max(ctx.timeout || DEFAULT_TIMEOUT, 1000),
    MAX_TIMEOUT
  );

  // Resolve session context
  let cwd: string | undefined;
  let sessionEnv: Record<string, string> | undefined;
  if (ctx.session_id) {
    const session = await getSession(ctx.session_id);
    if (!session) {
      ctx.reject(`Session not found: ${ctx.session_id}`, 'not_found');
      return ctx;
    }
    cwd = session.working_directory;
    sessionEnv = session.environment;
  }

  const execEnv = buildSafeEnv(sessionEnv);
  const startMs = Date.now();

  try {
    let result;
    if (ctx.shell) {
      result = await execAsync(ctx.command, {
        timeout: effectiveTimeout,
        env: execEnv,
        cwd,
        maxBuffer: 1024 * 1024,
      });
    } else {
      result = await execFileAsync(ctx.command, ctx.cmdArgs || [], {
        timeout: effectiveTimeout,
        env: execEnv,
        cwd,
        maxBuffer: 1024 * 1024,
      });
    }

    const durationMs = Date.now() - startMs;
    const rawOutput =
      result.stdout || result.stderr || 'Command executed successfully';
    // COM-01: sanitize output before it reaches audit logs
    ctx.result = {
      stdout: sanitizeOutput(truncateOutput(rawOutput)),
      stderr: sanitizeOutput(truncateOutput(result.stderr || '')),
      exit_code: 0,
      duration_ms: durationMs,
    };

    // Session state updates (cd, export)
    if (ctx.session_id && ctx.shell) {
      const cdTarget = parseCdTarget(ctx.command);
      if (cdTarget && cwd) {
        const newCwd = path.resolve(cwd, cdTarget);
        if (isCwdAllowed(newCwd)) {
          await updateSession(ctx.session_id, { working_directory: newCwd });
        }
      }
      const exports = parseExports(ctx.command);
      if (exports) {
        const session = await getSession(ctx.session_id);
        const existingEnv = session?.environment || {};
        await updateSession(ctx.session_id, {
          environment: { ...existingEnv, ...exports },
        });
      }
    }
  } catch (error) {
    const err = error as {
      message?: string;
      stdout?: string;
      stderr?: string;
      code?: string;
      killed?: boolean;
      signal?: string;
    };
    const durationMs = Date.now() - startMs;
    ctx.result = {
      stdout: sanitizeOutput(truncateOutput(err.stdout || '')),
      stderr: sanitizeOutput(truncateOutput(err.stderr || String(error))),
      exit_code: err.killed ? -1 : err.code === 'ENOENT' ? 1 : 1,
      duration_ms: durationMs,
    };
  }

  return ctx;
};
