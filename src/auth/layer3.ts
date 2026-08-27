/**
 * L3 Request Signature Layer — Per-request signing for replay protection
 *
 * Flow:
 *   sign_l3_request(caller, l2_private_key, command, args)
 *     → builds { caller, command, args, timestamp, nonce }
 *     → Ed25519_sign(L2.priv, json(payload))
 *     → returns { ok, request }
 *
 *   verify_l3_request(caller, l2_public_key, request)
 *     → validates schema
 *     → Ed25519_verify(L2.pub, signature, json(message_without_signature))
 *     → returns { ok, valid, caller, command, timestamp, nonce }
 */

import * as crypto from 'crypto';

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

function json(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function auditLog(caller: string, operation: string, detail: string): void {
  console.error(
    `[L3] ${new Date().toISOString()} caller=${caller} op=${operation} ${detail}`
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface L3Request {
  caller: string;
  command: string;
  args: Record<string, unknown>;
  timestamp: string; // ISO 8601
  nonce: string; // UUID v4, replay protection
  signature: string; // base64 Ed25519
}

export interface SignL3Result {
  ok: boolean;
  request: L3Request;
}

export interface VerifyL3Result {
  ok: boolean;
  valid: boolean;
  caller: string;
  command: string;
  timestamp: string;
  nonce: string;
  reason?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSigningPayload(
  caller: string,
  command: string,
  args: Record<string, unknown>,
  timestamp: string,
  nonce: string
): string {
  const payload = { caller, command, args, timestamp, nonce };
  return json(payload);
}

function signWithEd25519(privateKeyPEM: string, message: string): string {
  return crypto
    .sign(null, Buffer.from(message, 'utf8'), privateKeyPEM)
    .toString('base64');
}

function verifyWithEd25519(
  publicKeyPEM: string,
  signatureBase64: string,
  message: string
): boolean {
  try {
    return crypto.verify(
      null,
      Buffer.from(message, 'utf8'),
      publicKeyPEM,
      Buffer.from(signatureBase64, 'base64')
    );
  } catch {
    return false;
  }
}

function generateNonce(): string {
  return crypto.randomUUID();
}

// ─── sign_l3_request ─────────────────────────────────────────────────────────

interface SignL3Args {
  caller: string;
  l2_private_key: string;
  command: string;
  args: Record<string, unknown>;
}

function handleSignL3(rawArgs: unknown): ToolResult {
  const a = (rawArgs ?? {}) as SignL3Args;
  const caller = a.caller;

  if (!caller || typeof caller !== 'string') {
    return {
      content: [{ type: 'text', text: 'Error: caller is required' }],
      isError: true,
    };
  }
  if (!a.l2_private_key) {
    return {
      content: [{ type: 'text', text: 'Error: l2_private_key is required' }],
      isError: true,
    };
  }
  if (!a.command || typeof a.command !== 'string') {
    return {
      content: [{ type: 'text', text: 'Error: command is required' }],
      isError: true,
    };
  }

  try {
    const timestamp = new Date().toISOString();
    const nonce = generateNonce();
    const message = buildSigningPayload(
      caller,
      a.command,
      a.args ?? {},
      timestamp,
      nonce
    );
    const signature = signWithEd25519(a.l2_private_key, message);

    auditLog(caller, 'sign_l3', 'success');
    return {
      content: [
        {
          type: 'text',
          text: json({
            ok: true,
            request: {
              caller,
              command: a.command,
              args: a.args ?? {},
              timestamp,
              nonce,
              signature,
            },
          } satisfies SignL3Result),
        },
      ],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    auditLog(caller, 'sign_l3', `error:${msg}`);
    return {
      content: [{ type: 'text', text: `Error: ${msg}` }],
      isError: true,
    };
  }
}

// ─── verify_l3_request ───────────────────────────────────────────────────────

interface VerifyL3Args {
  caller: string;
  l2_public_key: string;
  request: L3Request;
}

function handleVerifyL3(rawArgs: unknown): ToolResult {
  const a = (rawArgs ?? {}) as VerifyL3Args;
  const caller = a.caller;

  if (!caller || typeof caller !== 'string') {
    return {
      content: [{ type: 'text', text: 'Error: caller is required' }],
      isError: true,
    };
  }
  if (!a.l2_public_key) {
    return {
      content: [{ type: 'text', text: 'Error: l2_public_key is required' }],
      isError: true,
    };
  }
  if (!a.request) {
    return {
      content: [{ type: 'text', text: 'Error: request is required' }],
      isError: true,
    };
  }

  const req = a.request;

  // Validate required fields
  if (
    !req.caller ||
    !req.command ||
    !req.timestamp ||
    !req.nonce ||
    !req.signature
  ) {
    return {
      content: [
        {
          type: 'text',
          text: json({
            ok: false,
            valid: false,
            caller: req.caller ?? '',
            command: req.command ?? '',
            timestamp: req.timestamp ?? '',
            nonce: req.nonce ?? '',
            reason: 'missing_request_fields',
          } satisfies VerifyL3Result),
        },
      ],
      isError: true,
    };
  }

  try {
    // Rebuild message without signature to verify
    const message = buildSigningPayload(
      req.caller,
      req.command,
      req.args ?? {},
      req.timestamp,
      req.nonce
    );

    const valid = verifyWithEd25519(a.l2_public_key, req.signature, message);

    auditLog(caller, 'verify_l3', valid ? 'verified' : 'invalid_signature');

    const result: VerifyL3Result = valid
      ? {
          ok: true,
          valid: true,
          caller: req.caller,
          command: req.command,
          timestamp: req.timestamp,
          nonce: req.nonce,
        }
      : {
          ok: true,
          valid: false,
          caller: req.caller,
          command: req.command,
          timestamp: req.timestamp,
          nonce: req.nonce,
          reason: 'invalid_signature',
        };

    return { content: [{ type: 'text', text: json(result) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    auditLog(caller, 'verify_l3', `error:${msg}`);
    return {
      content: [{ type: 'text', text: `Error: ${msg}` }],
      isError: true,
    };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const signL3Request = {
  definition: {
    name: 'sign_l3_request',
    description:
      'Sign an execute_command request with L2 private key for per-request authentication. Returns L3 request with signature.',
    inputSchema: {
      type: 'object',
      properties: {
        caller: { type: 'string', description: 'Must be a known 灵族 member.' },
        l2_private_key: {
          type: 'string',
          description: 'L2 Ed25519 private key PEM.',
        },
        command: { type: 'string', description: 'Command to execute.' },
        args: {
          type: 'object',
          description: 'Command arguments (for non-shell mode).',
        },
      },
      required: ['caller', 'l2_private_key', 'command'],
    },
  },
  handler: handleSignL3,
};

export const verifyL3Request = {
  definition: {
    name: 'verify_l3_request',
    description:
      'Verify L3 request signature against L2 public key. Called by server before executing command.',
    inputSchema: {
      type: 'object',
      properties: {
        caller: { type: 'string', description: 'Must be a known 灵族 member.' },
        l2_public_key: {
          type: 'string',
          description: 'L2 Ed25519 public key PEM.',
        },
        request: {
          type: 'object',
          description: 'L3 request with signature.',
        },
      },
      required: ['caller', 'l2_public_key', 'request'],
    },
  },
  handler: handleVerifyL3,
};
