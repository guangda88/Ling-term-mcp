import { randomUUID } from 'crypto';
import {
  type DispatchRequest,
  type DispatchResponse,
  type CommandStatus,
  type CommandResult,
  type HistoryEntry,
  type SourceRateLimit,
} from './types.js';
import { securityValidator } from '../security/validator.js';
import { isKnownMember } from '../security/identity.js';
import { logRejection } from '../audit/rejection_log.js';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { hashOutput } from '../audit/snapshot.js';
import { buildSafeEnv } from '../middleware/env_builder.js';
import {
  DEFAULT_TIMEOUT,
  MAX_TIMEOUT,
  isCwdAllowed,
  truncateOutput,
} from '../common/command_utils.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const MAX_HISTORY = 1000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

interface QueuedCommand {
  request_id: string;
  request: DispatchRequest;
  status: CommandStatus;
  session_id: string;
  created_at: number;
  started_at?: number;
  completed_at?: number;
  result?: CommandResult;
  rejection_reason?: string;
}

export class CommandQueue {
  private queue = new Map<string, QueuedCommand>();
  private rateLimits = new Map<string, SourceRateLimit>();
  private startTime = Date.now();

  async dispatch(request: DispatchRequest): Promise<DispatchResponse> {
    if (!request.source || !isKnownMember(request.source)) {
      logRejection({
        command: request.command,
        caller: request.source ?? 'unknown',
        reason: `Unknown source: '${request.source}'`,
        category: 'unknown',
        session_id: request.session_id ?? undefined,
        shell: request.shell ?? undefined,
      });
      return {
        request_id: randomUUID(),
        status: 'rejected',
        session_id: '',
        rejection_reason: `Unknown source: '${request.source}'`,
      };
    }

    if (!this.checkRateLimit(request.source)) {
      logRejection({
        command: request.command,
        caller: request.source,
        reason: `Rate limit exceeded`,
        category: 'unknown',
        session_id: request.session_id ?? undefined,
        shell: request.shell ?? undefined,
      });
      return {
        request_id: randomUUID(),
        status: 'rejected',
        session_id: '',
        rejection_reason: `Rate limit exceeded for source: ${request.source}`,
      };
    }

    const commandForValidation = request.command;
    const securityCheck = securityValidator.validateCommand(
      commandForValidation,
      [],
      request.shell ?? false
    );
    if (!securityCheck.valid) {
      logRejection({
        command: request.command,
        caller: request.source,
        reason: securityCheck.error ?? 'security validation failed',
        category: 'pattern',
        session_id: request.session_id ?? undefined,
        shell: request.shell ?? undefined,
      });
      return {
        request_id: randomUUID(),
        status: 'rejected',
        session_id: request.session_id ?? '',
        rejection_reason: `Security: ${securityCheck.error}`,
      };
    }

    const requestId = randomUUID();
    const sessionId = request.session_id || randomUUID();

    const entry: QueuedCommand = {
      request_id: requestId,
      request,
      status: 'queued',
      session_id: sessionId,
      created_at: Date.now(),
    };

    this.queue.set(requestId, entry);

    if (this.queue.size > MAX_HISTORY) {
      const oldest = [...this.queue.entries()].sort(
        ([, a], [, b]) => a.created_at - b.created_at
      );
      const toDelete = oldest.slice(0, oldest.length - MAX_HISTORY);
      for (const [key] of toDelete) {
        this.queue.delete(key);
      }
    }

    this.executeAsync(entry).catch((err) => {
      console.error('[gateway] executeAsync failed:', err);
    });

    return {
      request_id: requestId,
      status: 'running',
      session_id: sessionId,
    };
  }

  private async executeAsync(entry: QueuedCommand): Promise<void> {
    entry.status = 'running';
    entry.started_at = Date.now();

    const { request } = entry;
    const effectiveTimeout = Math.min(
      Math.max(request.timeout || DEFAULT_TIMEOUT, 1000),
      MAX_TIMEOUT
    );

    const cwd = request.cwd
      ? isCwdAllowed(path.resolve(request.cwd))
        ? request.cwd
        : undefined
      : undefined;

    try {
      const startMs = Date.now();
      let result;
      if (request.shell) {
        result = await execAsync(request.command, {
          timeout: effectiveTimeout,
          cwd,
          env: buildSafeEnv(),
          maxBuffer: 1024 * 1024,
        });
      } else {
        const parts = request.command.split(/\s+/);
        const bin = parts[0];
        const args = parts.slice(1);
        result = await execFileAsync(bin, args, {
          timeout: effectiveTimeout,
          cwd,
          env: buildSafeEnv(),
          maxBuffer: 1024 * 1024,
        });
      }
      const durationMs = Date.now() - startMs;
      const rawOutput = result.stdout || result.stderr || '';
      const outputHash = hashOutput(rawOutput);

      entry.result = {
        stdout: truncateOutput(result.stdout || ''),
        stderr: truncateOutput(result.stderr || ''),
        exit_code: 0,
        duration_ms: durationMs,
        output_hash: outputHash,
      };
      entry.status = 'completed';
    } catch (error: unknown) {
      const err = error as {
        stdout?: string;
        stderr?: string;
        killed?: boolean;
        code?: string;
      };
      const durationMs = Date.now() - (entry.started_at ?? Date.now());
      const combined = [err.stdout, err.stderr].filter(Boolean).join('\n');

      entry.result = {
        stdout: truncateOutput(err.stdout || ''),
        stderr: truncateOutput(err.stderr || String(error)),
        exit_code: err.killed ? -1 : 1,
        duration_ms: durationMs,
        output_hash: hashOutput(combined || String(error)),
      };
      entry.status = 'failed';
    }

    entry.completed_at = Date.now();
  }

  cancel(
    requestId: string,
    source: string
  ): {
    cancelled: boolean;
    reason?: string;
  } {
    const entry = this.queue.get(requestId);
    if (!entry) {
      return {
        cancelled: false,
        reason: 'Request not found',
      };
    }
    if (entry.request.source !== source) {
      return {
        cancelled: false,
        reason: 'Source mismatch',
      };
    }
    if (entry.status !== 'queued' && entry.status !== 'running') {
      return {
        cancelled: false,
        reason: `Command already ${entry.status}`,
      };
    }
    entry.status = 'rejected';
    entry.rejection_reason = 'Cancelled by source';
    entry.completed_at = Date.now();
    return {
      cancelled: true,
    };
  }

  getStatus(): {
    status: string;
    active_commands: number;
    sessions: number;
    uptime_s: number;
    pending_queue: number;
  } {
    let active = 0;
    const sessions = new Set<string>();
    let pending = 0;
    for (const entry of this.queue.values()) {
      sessions.add(entry.session_id);
      if (entry.status === 'running') active++;
      if (entry.status === 'queued') pending++;
    }
    return {
      status: 'healthy',
      active_commands: active,
      sessions: sessions.size,
      uptime_s: Math.floor((Date.now() - this.startTime) / 1000),
      pending_queue: pending,
    };
  }

  getHistory(limit = 50): HistoryEntry[] {
    const entries = [...this.queue.values()]
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, limit);
    return entries.map((e) => ({
      request_id: e.request_id,
      command: e.request.command,
      source: e.request.source,
      status: e.status,
      started_at: new Date(e.started_at ?? e.created_at).toISOString(),
      completed_at: e.completed_at
        ? new Date(e.completed_at).toISOString()
        : undefined,
      exit_code: e.result?.exit_code,
    }));
  }

  private checkRateLimit(source: string): boolean {
    const now = Date.now();
    const limit = this.rateLimits.get(source);
    if (!limit || now > limit.resetAt) {
      this.rateLimits.set(source, {
        count: 1,
        resetAt: now + RATE_LIMIT_WINDOW_MS,
      });
      return true;
    }
    if (limit.count >= RATE_LIMIT_MAX) return false;
    limit.count++;
    return true;
  }
}
