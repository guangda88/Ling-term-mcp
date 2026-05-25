import { randomUUID } from 'crypto';
import { isKnownMember } from '../security/identity.js';

interface AuthorizationRequest {
  id: string;
  caller: string;
  operation: string;
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

export const requireAuthorization = {
  definition: {
    name: 'require_authorization',
    description:
      'Request user authorization for a red-zone operation (e.g. modifying shared code, publishing, deleting). Returns a pending request ID. Must be approved via approve_authorization before proceeding.',
    inputSchema: {
      type: 'object',
      properties: {
        caller: {
          type: 'string',
          description:
            "Identity of the requesting member (e.g. 'lingflow', 'lingclaude')",
        },
        operation: {
          type: 'string',
          description: 'Description of the operation requiring authorization',
        },
        details: {
          type: 'object',
          description: 'Additional details about the operation',
          additionalProperties: true,
        },
      },
      required: ['caller', 'operation'],
    },
  },

  async handler(args: unknown) {
    const {
      caller,
      operation,
      details = {},
    } = args as {
      caller: string;
      operation: string;
      details?: Record<string, unknown>;
    };

    if (!caller || typeof caller !== 'string') {
      return {
        content: [{ type: 'text' as const, text: 'Error: caller is required' }],
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
          text: JSON.stringify(
            {
              authorization_id: id,
              status: 'pending',
              operation,
              caller,
              expires_at: req.expires_at,
              message: `Authorization required for: ${operation}. Use approve_authorization with this ID to proceed.`,
            },
            null,
            2
          ),
        },
      ],
    };
  },
};

export const approveAuthorization = {
  definition: {
    name: 'approve_authorization',
    description:
      'Approve or reject a pending authorization request. Only user-authorized callers (lingflow_plus, or the original requester for cancellation) can resolve.',
    inputSchema: {
      type: 'object',
      properties: {
        authorization_id: {
          type: 'string',
          description: 'The authorization request ID to resolve',
        },
        decision: {
          type: 'string',
          enum: ['approve', 'reject'],
          description: 'Whether to approve or reject the request',
        },
        resolved_by: {
          type: 'string',
          description:
            "Identity of the resolver (e.g. 'lingflow_plus', 'user')",
        },
        reason: {
          type: 'string',
          description: 'Optional reason for the decision',
        },
      },
      required: ['authorization_id', 'decision', 'resolved_by'],
    },
  },

  async handler(args: unknown) {
    const { authorization_id, decision, resolved_by, reason } = args as {
      authorization_id: string;
      decision: 'approve' | 'reject';
      resolved_by: string;
      reason?: string;
    };

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

    const now = new Date().toISOString();
    req.status = decision === 'approve' ? 'approved' : 'rejected';
    req.resolved_by = resolved_by;
    req.resolved_at = now;

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              authorization_id,
              status: req.status,
              operation: req.operation,
              caller: req.caller,
              resolved_by,
              resolved_at: now,
              reason: reason || undefined,
            },
            null,
            2
          ),
        },
      ],
    };
  },
};

export const listAuthorizations = {
  definition: {
    name: 'list_authorizations',
    description:
      'List authorization requests, optionally filtered by status or caller.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'approved', 'rejected', 'expired'],
          description: 'Filter by status',
        },
        caller: {
          type: 'string',
          description: 'Filter by caller identity',
        },
      },
    },
  },

  async handler(args: unknown) {
    const { status, caller } = args as {
      status?: string;
      caller?: string;
    };

    cleanup();

    let results = [...requests.values()];
    if (status) results = results.filter((r) => r.status === status);
    if (caller) results = results.filter((r) => r.caller === caller);
    results.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
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
            },
            null,
            2
          ),
        },
      ],
    };
  },
};

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

export function _resetForTesting(): void {
  requests.clear();
}
