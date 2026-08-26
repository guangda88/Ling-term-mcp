import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { isKnownMember } from '../security/identity.js';

interface AuthorizationRequest {
  id: string;
  caller: string;
  operation: string;
  command?: string;
  details: Record<string, unknown>;
  created_at: string;
  expires_at: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  resolved_by?: string;
  resolved_at?: string;
  // Persistent token fields
  persistent?: boolean;
  max_usage?: number;
  usage_count?: number;
  // SEC-001: Meeting auth token fields
  target?: 'command' | 'meeting_invite' | 'unbound_auth';
  meeting_id?: string;
  agent_id?: string;
  scope?: string[];
}

const requests = new Map<string, AuthorizationRequest>();
const AUTH_TTL_MS = 10 * 60 * 1000;
const PERSISTENT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DEFAULT_MAX_USAGE = 100;
const MAX_PENDING = 100;

// Persist authorization requests to JSONL so they survive process restarts
// and are visible across co-located instances (stdio / http / gateway).
const AUTH_LOG_DIR =
  process.env.LING_TERM_BASEDIR || path.join(os.homedir(), '.ling-term-mcp');
const AUTH_LOG_FILE = path.join(AUTH_LOG_DIR, 'authorizations.jsonl');

function persistRequest(r: AuthorizationRequest): void {
  try {
    if (!fs.existsSync(AUTH_LOG_DIR)) {
      fs.mkdirSync(AUTH_LOG_DIR, { recursive: true });
    }
    fs.appendFileSync(AUTH_LOG_FILE, JSON.stringify(r) + '\n', 'utf8');
  } catch {
    // Non-fatal: persistence must never block the authorization flow
  }
}

/**
 * Replay authorizations.jsonl into the in-memory Map. The log is
 * append-only, so the last record for each id wins. Called at module load
 * and lazily on lookups so instances pick up requests created by
 * co-located instances after startup.
 */
function loadPersistedRequests(): void {
  try {
    if (!fs.existsSync(AUTH_LOG_FILE)) return;
    const lines = fs.readFileSync(AUTH_LOG_FILE, 'utf8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line) as AuthorizationRequest;
        if (r && typeof r.id === 'string') {
          requests.set(r.id, r);
        }
      } catch {
        // Skip malformed lines; never block startup on corrupt log
      }
    }
  } catch {
    // Non-fatal: unreadable log means starting with an empty Map
  }
}

loadPersistedRequests();

function cleanup(): void {
  const now = Date.now();
  for (const [, req] of requests) {
    if (req.status === 'pending' && now > new Date(req.expires_at).getTime()) {
      req.status = 'expired';
    }
  }
  if (requests.size > MAX_PENDING) {
    const sorted = [...requests.entries()].sort(
      ([, a], [, b]) => +new Date(a.created_at) - +new Date(b.created_at)
    );
    for (const [entryId, req] of sorted) {
      if (req.status !== 'pending') requests.delete(entryId);
      if (requests.size <= MAX_PENDING) break;
    }
  }
}

function json(data: unknown) {
  return JSON.stringify(data, null, 2);
}

export const authorize = {
  definition: {
    name: 'authorize',
    description:
      'Manage red-zone authorization requests. Commands: require (request approval), approve (approve/reject), list (list requests).',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          enum: ['require', 'approve', 'list', 'issue', 'verify'],
          description: 'Authorization operation to perform',
        },
        caller: {
          type: 'string',
          description:
            "Caller identity (required for 'require', used for 'list' filter)",
        },
        operation: {
          type: 'string',
          description: "Operation description (required for 'require')",
        },
        command_bind: {
          type: 'string',
          description: 'Optional command string to bind this authorization to',
        },
        details: {
          type: 'object',
          description: 'Additional details about the operation',
          additionalProperties: true,
        },
        authorization_id: {
          type: 'string',
          description: "Authorization ID (required for 'approve')",
        },
        decision: {
          type: 'string',
          enum: ['approve', 'reject'],
          description: "Decision (required for 'approve')",
        },
        resolved_by: {
          type: 'string',
          description: "Identity of the resolver (required for 'approve')",
        },
        reason: {
          type: 'string',
          description: 'Optional reason for the decision',
        },
        status: {
          type: 'string',
          enum: ['pending', 'approved', 'rejected', 'expired'],
          description: "Filter by status (optional, for 'list')",
        },
        persistent: {
          type: 'boolean',
          description:
            'Create a persistent token (30-day, max_usage uses). Default: false.',
        },
        max_usage: {
          type: 'number',
          description: 'Max usage count for persistent tokens. Default: 100.',
        },
        agent_id: {
          type: 'string',
          description:
            "External agent ID (for 'issue'/'verify' meeting tokens)",
        },
        meeting_id: {
          type: 'string',
          description: "Meeting ID to bind token to (for 'issue'/'verify')",
        },
        auth_token: {
          type: 'string',
          description: "Token to verify (for 'verify')",
        },
      },
      required: ['command'],
    },
  },

  async handler(args: unknown) {
    const {
      command,
      caller,
      operation,
      command_bind,
      details = {},
      authorization_id,
      decision,
      resolved_by,
      reason,
      status,
      persistent = false,
      max_usage,
      agent_id,
      meeting_id,
      auth_token,
    } = args as {
      command: string;
      caller?: string;
      operation?: string;
      command_bind?: string;
      details?: Record<string, unknown>;
      authorization_id?: string;
      decision?: 'approve' | 'reject';
      resolved_by?: string;
      reason?: string;
      status?: string;
      persistent?: boolean;
      max_usage?: number;
      agent_id?: string;
      meeting_id?: string;
      auth_token?: string;
    };

    switch (command) {
      case 'require': {
        if (!caller || typeof caller !== 'string') {
          return {
            content: [
              { type: 'text' as const, text: 'Error: caller is required' },
            ],
            isError: true,
          };
        }
        if (!isKnownMember(caller)) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error: '${caller}' is not a registered 灵族 member`,
              },
            ],
            isError: true,
          };
        }
        if (!operation || typeof operation !== 'string') {
          return {
            content: [
              { type: 'text' as const, text: 'Error: operation is required' },
            ],
            isError: true,
          };
        }

        cleanup();

        const now = new Date();
        const id = randomUUID();
        const ttl = persistent ? PERSISTENT_TTL_MS : AUTH_TTL_MS;
        const req: AuthorizationRequest = {
          id,
          caller,
          operation,
          command: command_bind,
          details,
          created_at: now.toISOString(),
          expires_at: new Date(now.getTime() + ttl).toISOString(),
          status: 'pending',
          persistent: persistent || undefined,
          max_usage: persistent ? (max_usage ?? DEFAULT_MAX_USAGE) : undefined,
          usage_count: 0,
        };

        requests.set(id, req);
        persistRequest(req);

        return {
          content: [
            {
              type: 'text' as const,
              text: json({
                authorization_id: id,
                status: 'pending',
                operation,
                caller,
                expires_at: req.expires_at,
                persistent: persistent || undefined,
                max_usage: req.max_usage,
                message: persistent
                  ? `Persistent authorization (max ${req.max_usage} uses, 30 days) required for: ${operation}. Use authorize approve with this ID to proceed.`
                  : `Authorization required for: ${operation}. Use authorize approve with this ID to proceed.`,
              }),
            },
          ],
        };
      }

      case 'approve': {
        if (!authorization_id || typeof authorization_id !== 'string') {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: authorization_id is required',
              },
            ],
            isError: true,
          };
        }

        if (!resolved_by || typeof resolved_by !== 'string') {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: resolved_by is required',
              },
            ],
            isError: true,
          };
        }

        const authorized = resolved_by === 'user' || isKnownMember(resolved_by);
        if (!authorized) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error: '${resolved_by}' is not authorized to approve requests`,
              },
            ],
            isError: true,
          };
        }

        // Self-approval guard: requester cannot approve their own request
        loadPersistedRequests();
        const req = requests.get(authorization_id);
        if (!req) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error: authorization request '${authorization_id}' not found`,
              },
            ],
            isError: true,
          };
        }

        if (req.status !== 'pending') {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error: request is already ${req.status} (resolved by ${req.resolved_by || 'system'} at ${req.resolved_at || 'unknown'})`,
              },
            ],
            isError: true,
          };
        }

        if (resolved_by !== 'user' && req.caller === resolved_by) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error: self-approval denied — '${resolved_by}' cannot approve their own request (requester is also '${req.caller}')`,
              },
            ],
            isError: true,
          };
        }

        const resolvedNow = new Date().toISOString();
        req.status = decision === 'approve' ? 'approved' : 'rejected';
        req.resolved_by = resolved_by;
        req.resolved_at = resolvedNow;
        persistRequest(req);

        return {
          content: [
            {
              type: 'text' as const,
              text: json({
                authorization_id,
                status: req.status,
                operation: req.operation,
                caller: req.caller,
                resolved_by,
                resolved_at: resolvedNow,
                reason: reason || undefined,
              }),
            },
          ],
        };
      }

      case 'list': {
        loadPersistedRequests();
        cleanup();

        let results = [...requests.values()];
        if (status) results = results.filter((r) => r.status === status);
        if (caller) results = results.filter((r) => r.caller === caller);
        results.sort(
          (a, b) => +new Date(b.created_at) - +new Date(a.created_at)
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: json({
                total: results.length,
                requests: results.map((r) => ({
                  id: r.id,
                  caller: r.caller,
                  operation: r.operation,
                  status: r.status,
                  created_at: r.created_at,
                  resolved_by: r.resolved_by,
                  resolved_at: r.resolved_at,
                })),
              }),
            },
          ],
        };
      }

      case 'issue': {
        if (!caller || typeof caller !== 'string') {
          return {
            content: [
              { type: 'text' as const, text: 'Error: caller is required' },
            ],
            isError: true,
          };
        }
        if (!isKnownMember(caller)) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error: '${caller}' is not a registered 灵族 member`,
              },
            ],
            isError: true,
          };
        }
        // agent_id and meeting_id are optional (unbound tokens allowed for GAP-2 fix)
        const hasAgentId = agent_id && typeof agent_id === 'string';
        const hasMeetingId = meeting_id && typeof meeting_id === 'string';

        cleanup();

        const now = new Date();
        const id = randomUUID();
        const ttl = persistent ? PERSISTENT_TTL_MS : AUTH_TTL_MS;
        const scope = hasAgentId && hasMeetingId ? ['join', 'speak'] : [];
        const req: AuthorizationRequest = {
          id,
          caller,
          operation:
            hasAgentId && hasMeetingId
              ? `meeting token for ${agent_id} -> ${meeting_id}`
              : 'unbound token',
          details: {
            agent_id: hasAgentId ? agent_id : undefined,
            meeting_id: hasMeetingId ? meeting_id : undefined,
          },
          created_at: now.toISOString(),
          expires_at: new Date(now.getTime() + ttl).toISOString(),
          status: 'approved',
          resolved_by: caller,
          resolved_at: now.toISOString(),
          persistent: persistent || undefined,
          max_usage: persistent ? (max_usage ?? DEFAULT_MAX_USAGE) : undefined,
          usage_count: 0,
          target:
            hasAgentId && hasMeetingId ? 'meeting_invite' : 'unbound_auth',
          meeting_id: hasMeetingId ? meeting_id : undefined,
          agent_id: hasAgentId ? agent_id : undefined,
          scope,
        };

        requests.set(id, req);
        persistRequest(req);

        return {
          content: [
            {
              type: 'text' as const,
              text: json({
                auth_token: id,
                agent_id: hasAgentId ? agent_id : undefined,
                meeting_id: hasMeetingId ? meeting_id : undefined,
                scope,
                expires_at: req.expires_at,
                persistent: persistent || undefined,
                max_usage: req.max_usage,
                status: 'approved',
              }),
            },
          ],
        };
      }

      case 'verify': {
        if (!auth_token || typeof auth_token !== 'string') {
          return {
            content: [
              { type: 'text' as const, text: 'Error: auth_token is required' },
            ],
            isError: true,
          };
        }

        const verifyResult = verifyMeetingToken(
          auth_token,
          agent_id,
          meeting_id
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: json(verifyResult),
            },
          ],
        };
      }

      default:
        throw new Error(
          `Unknown authorize command: '${command}'. Valid: require, approve, list, issue, verify`
        );
    }
  },
};

// Exported for use by execute_command (same-process access)
export function getAuthorizationStatus(
  id: string
): AuthorizationRequest | undefined {
  loadPersistedRequests();
  const req = requests.get(id);
  if (req && req.status === 'pending') {
    const now = Date.now();
    if (now > new Date(req.expires_at).getTime()) {
      req.status = 'expired';
      persistRequest(req);
    }
  }
  return req;
}

export function checkRedZoneAuthorization(
  authorizationId: string,
  command: string,
  caller?: string
): { allowed: boolean; error?: string } {
  loadPersistedRequests();
  const req = requests.get(authorizationId);
  if (!req) {
    return {
      allowed: false,
      error: `Authorization '${authorizationId}' not found`,
    };
  }
  if (req.status === 'pending') {
    const now = Date.now();
    if (now > new Date(req.expires_at).getTime()) {
      req.status = 'expired';
      persistRequest(req);
    }
  }
  if (req.status !== 'approved') {
    return {
      allowed: false,
      error: `Authorization is ${req.status} (must be approved)`,
    };
  }
  // BUS-01: caller must match the original requester
  if (caller && req.caller !== caller) {
    return {
      allowed: false,
      error: `Authorization bound to caller '${req.caller}' but used by '${caller}' (caller mismatch)`,
    };
  }
  if (req.command) {
    const boundCmd = req.command;
    if (
      command !== boundCmd &&
      !command.startsWith(boundCmd + ' ') &&
      !command.startsWith(boundCmd + '-')
    ) {
      return {
        allowed: false,
        error: `Authorization bound to '${boundCmd}' but used for '${command}' (prefix match failed)`,
      };
    }
  }

  // Persistent token: check usage limit, increment without consuming
  if (req.persistent) {
    if (req.usage_count !== undefined && req.max_usage !== undefined) {
      if (req.usage_count >= req.max_usage) {
        req.status = 'expired';
        persistRequest(req);
        return {
          allowed: false,
          error: `Persistent token exhausted (${req.usage_count}/${req.max_usage} uses)`,
        };
      }
      req.usage_count++;
      persistRequest(req);
    }
    return { allowed: true };
  }

  // Single-use token: consume after successful check
  req.status = 'expired';
  persistRequest(req);
  return { allowed: true };
}

export function verifyMeetingToken(
  token: string,
  agentId?: string,
  meetingId?: string
): {
  valid: boolean;
  scope?: string[];
  agent_id?: string;
  meeting_id?: string;
  reason?: string;
  usage_count?: number;
  max_usage?: number;
} {
  loadPersistedRequests();
  const req = requests.get(token);
  if (!req) {
    return { valid: false, reason: 'token not found' };
  }
  // Support both meeting_invite and unbound_auth tokens
  if (req.target !== 'meeting_invite' && req.target !== 'unbound_auth') {
    return { valid: false, reason: 'token is not a valid auth token' };
  }
  // Check expiry first (may transition approved → expired)
  const now = Date.now();
  if (now > new Date(req.expires_at).getTime()) {
    req.status = 'expired';
    persistRequest(req);
    return { valid: false, reason: 'token expired' };
  }
  // Check max_usage BEFORE status, so an exhausted token returns 'exhausted'
  // rather than 'token status is expired' (status was auto-set to 'expired'
  // when the cap was reached on the previous verification).
  if (
    req.persistent &&
    req.usage_count !== undefined &&
    req.max_usage !== undefined &&
    req.usage_count >= req.max_usage
  ) {
    return {
      valid: false,
      reason: `token exhausted (${req.usage_count}/${req.max_usage})`,
    };
  }
  if (req.status !== 'approved') {
    return {
      valid: false,
      reason: `token status is ${req.status}`,
    };
  }
  // GAP-2 Fix: Enforce binding checks - if token was bound to agent_id, verify request MUST provide it
  // Previous bug: "if (agentId && ...)" skipped check when verify request omitted agent_id
  if (req.agent_id) {
    if (!agentId) {
      return {
        valid: false,
        reason: `agent_id binding required but not provided`,
      };
    }
    if (agentId !== req.agent_id) {
      return {
        valid: false,
        reason: `agent_id mismatch (token bound to '${req.agent_id}')`,
      };
    }
  }
  // GAP-2 Fix: Enforce binding checks - if token was bound to meeting_id, verify request MUST provide it
  // Previous bug: "if (meetingId && ...)" skipped check when verify request omitted meeting_id
  if (req.meeting_id) {
    if (!meetingId) {
      return {
        valid: false,
        reason: `meeting_id binding required but not provided`,
      };
    }
    if (meetingId !== req.meeting_id) {
      return {
        valid: false,
        reason: `meeting_id mismatch (token bound to '${req.meeting_id}')`,
      };
    }
  }
  if (req.persistent) {
    if (req.usage_count !== undefined && req.max_usage !== undefined) {
      // Increment usage on successful verification
      req.usage_count++;
      // Auto-expire when usage cap is reached
      if (req.usage_count >= req.max_usage) {
        req.status = 'expired';
      }
      persistRequest(req);
    }
  }
  return {
    valid: true,
    scope: req.scope,
    agent_id: req.agent_id,
    meeting_id: req.meeting_id,
    usage_count: req.usage_count,
    max_usage: req.max_usage,
  };
}

export function _resetForTesting(): void {
  requests.clear();
  try {
    if (fs.existsSync(AUTH_LOG_FILE)) fs.unlinkSync(AUTH_LOG_FILE);
  } catch {
    // Non-fatal in tests
  }
}
