/**
 * Coordinator Role — 灵犀作为终端协调器
 *
 * Receives terminal commands from lingflow_plus (or other coordinators),
 * validates security, executes, and returns results.
 * Reuses existing security/validator.ts and audit infrastructure.
 */

import { CommandQueue } from './queue.js';
import type {
  DispatchRequest,
  DispatchResponse,
  HistoryEntry,
} from './types.js';
import { isKnownMember } from '../security/identity.js';

export class Coordinator {
  private queue: CommandQueue;
  private criticalSources = new Set(['lingflow_plus']);

  constructor() {
    this.queue = new CommandQueue();
  }

  async dispatch(request: DispatchRequest): Promise<DispatchResponse> {
    if (!request.command || typeof request.command !== 'string') {
      return {
        request_id: '',
        status: 'rejected',
        session_id: '',
        rejection_reason: 'Command is required and must be a string',
      };
    }

    if (!request.source) {
      return {
        request_id: '',
        status: 'rejected',
        session_id: '',
        rejection_reason: 'Source is required',
      };
    }

    if (!isKnownMember(request.source)) {
      return {
        request_id: '',
        status: 'rejected',
        session_id: '',
        rejection_reason: `Unknown source: '${request.source}' is not a registered 灵族 member`,
      };
    }

    if (
      request.priority === 'critical' &&
      !this.criticalSources.has(request.source)
    ) {
      return {
        request_id: '',
        status: 'rejected',
        session_id: '',
        rejection_reason: `Critical priority requires one of: ${[...this.criticalSources].join(', ')}`,
      };
    }

    return this.queue.dispatch(request);
  }

  cancel(
    requestId: string,
    source: string
  ): { cancelled: boolean; reason?: string } {
    if (!isKnownMember(source)) {
      return { cancelled: false, reason: 'Unknown source' };
    }
    return this.queue.cancel(requestId, source);
  }

  getStatus() {
    return this.queue.getStatus();
  }

  getHistory(limit?: number): HistoryEntry[] {
    return this.queue.getHistory(limit);
  }
}
