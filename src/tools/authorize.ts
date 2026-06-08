import { randomUUID } from 'crypto';
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
}

const requests = new Map<string, AuthorizationRequest>();
const AUTH_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING = 100;

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
          enum: ['require', 'approve', 'list'],
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
        const req: AuthorizationRequest = {
          id,
          caller,
          operation,
          command: command_bind,
          details,
          created_at: now.toISOString(),
          expires_at: new Date(now.getTime() + AUTH_TTL_MS).toISOString(),
          status: 'pending',
        };

        requests.set(id, req);

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
                message: `Authorization required for: ${operation}. Use authorize approve with this ID to proceed.`,
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

        const resolvedNow = new Date().toISOString();
        req.status = decision === 'approve' ? 'approved' : 'rejected';
        req.resolved_by = resolved_by;
        req.resolved_at = resolvedNow;

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

      default:
        throw new Error(
          `Unknown authorize command: '${command}'. Valid: require, approve, list`
        );
    }
  },
};

// Exported for use by execute_command (same-process access)
export function getAuthorizationStatus(
  id: string
): AuthorizationRequest | undefined {
  const req = requests.get(id);
  if (req && req.status === 'pending') {
    const now = Date.now();
    if (now > new Date(req.expires_at).getTime()) {
      req.status = 'expired';
    }
  }
  return req;
}

export function checkRedZoneAuthorization(
  authorizationId: string,
  command: string
): { allowed: boolean; error?: string } {
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
    }
  }
  if (req.status !== 'approved') {
    return {
      allowed: false,
      error: `Authorization is ${req.status} (must be approved)`,
    };
  }
  if (req.command && req.command !== command) {
    return {
      allowed: false,
      error: `Authorization bound to '${req.command}' but used for '${command}'`,
    };
  }
  return { allowed: true };
}

export function _resetForTesting(): void {
  requests.clear();
}
