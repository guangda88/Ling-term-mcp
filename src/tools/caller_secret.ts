/**
 * Caller Secret Tool — T6 caller_secret 下发 (方案2: 共享文件持久化)
 *
 * Tools:
 *   - distribute_caller_secret: 从 env 读取 LINGMESSAGE_CALLER_SECRET,
 *     写入 ~/.lingmessage/caller_secret (mode 0600)。红区审计。
 *   - read_caller_signature(identity): 测试/调试用, HMAC-SHA256(secret, identity)
 *     截断 16 hex 字符。
 *
 * 调用者: caller 必须是合法灵族成员 (isKnownMember)。
 * 红区标记: distribute_caller_secret 写敏感路径, console.error 留痕。
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { isKnownMember } from '../security/identity.js';

function json(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

function textResponse(text: string): ToolResult {
  return { content: [{ type: 'text' as const, text }] };
}

function errorResponse(message: string): ToolResult {
  return {
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
    isError: true,
  };
}

function resolveSecretPath(): string {
  const explicit = process.env['LINGMESSAGE_CALLER_SECRET_FILE'];
  if (explicit && explicit.trim().length > 0) return explicit;
  return path.join(os.homedir(), '.lingmessage', 'caller_secret');
}

function auditLog(
  caller: string,
  operation: string,
  target: string,
  result: string
): void {
  console.error(
    `[caller_secret] ${new Date().toISOString()} caller=${caller} ` +
      `operation=${operation} target=${target} result=${result}`
  );
}

interface DistributeArgs {
  caller: string;
  secret?: string;
  force?: boolean;
}

async function handleDistribute(rawArgs: unknown): Promise<ToolResult> {
  const a = (rawArgs ?? {}) as DistributeArgs;
  const caller = a.caller;
  if (!caller || typeof caller !== 'string') {
    return errorResponse('caller is required and must be a string');
  }
  if (!isKnownMember(caller)) {
    auditLog(caller, 'distribute', 'unknown', 'rejected');
    return errorResponse(`Unknown caller: ${caller}`);
  }

  const target = resolveSecretPath();
  const envSecret = process.env['LINGMESSAGE_CALLER_SECRET'] ?? '';
  const secret = a.secret ?? envSecret;
  if (!secret || secret.trim().length === 0) {
    auditLog(caller, 'distribute', target, 'missing_secret');
    return errorResponse(
      'No secret provided. Pass `secret` arg or set LINGMESSAGE_CALLER_SECRET env.'
    );
  }

  const existing = fs.existsSync(target);
  if (existing && !a.force) {
    auditLog(caller, 'distribute', target, 'already_exists');
    return errorResponse(
      `Secret file already exists at ${target}. Pass force=true to overwrite.`
    );
  }

  try {
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    fs.writeFileSync(target, secret, { encoding: 'utf8', mode: 0o600 });
    fs.chmodSync(target, 0o600);
    const st = fs.statSync(target);
    auditLog(caller, 'distribute', target, 'success');
    return textResponse(
      json({
        ok: true,
        path: target,
        bytes: st.size,
        mode: '0600',
        overwritten: existing,
        caller,
      })
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    auditLog(caller, 'distribute', target, `error:${msg}`);
    return errorResponse(`Failed to write secret file: ${msg}`);
  }
}

interface ReadSignatureArgs {
  caller: string;
  identity: string;
}

function handleReadSignature(rawArgs: unknown): ToolResult {
  const a = (rawArgs ?? {}) as ReadSignatureArgs;
  const caller = a.caller;
  const identity = a.identity;
  if (!caller || typeof caller !== 'string') {
    return errorResponse('caller is required and must be a string');
  }
  if (!isKnownMember(caller)) {
    return errorResponse(`Unknown caller: ${caller}`);
  }
  if (!identity || typeof identity !== 'string') {
    return errorResponse('identity is required and must be a string');
  }

  const target = resolveSecretPath();
  if (!fs.existsSync(target)) {
    return errorResponse(
      `Secret file not found at ${target}. Run distribute_caller_secret first.`
    );
  }

  let secret: string;
  try {
    secret = fs.readFileSync(target, 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResponse(`Failed to read secret: ${msg}`);
  }

  const sig = crypto
    .createHmac('sha256', secret)
    .update(identity)
    .digest('hex')
    .slice(0, 16);

  return textResponse(
    json({
      identity,
      signature: sig,
      algorithm: 'HMAC-SHA256',
      truncated: true,
      caller,
    })
  );
}

export const distributeCallerSecret = {
  definition: {
    name: 'distribute_caller_secret',
    description:
      '[RED ZONE] Write the caller HMAC secret to ~/.lingmessage/caller_secret (mode 0600). Reads from LINGMESSAGE_CALLER_SECRET env or `secret` arg. Caller must be a known 灵族 member. Pass force=true to overwrite existing file.',
    inputSchema: {
      type: 'object',
      properties: {
        caller: {
          type: 'string',
          description: 'Caller identity. Must be a known 灵族 member.',
        },
        secret: {
          type: 'string',
          description:
            'Override secret (default: read LINGMESSAGE_CALLER_SECRET env).',
        },
        force: {
          type: 'boolean',
          description: 'Overwrite existing secret file. Default: false.',
        },
      },
      required: ['caller'],
    },
  },
  async handler(args: unknown): Promise<ToolResult> {
    return await handleDistribute(args);
  },
};

export const readCallerSignature = {
  definition: {
    name: 'read_caller_signature',
    description:
      'Test/debug: compute HMAC-SHA256(secret, identity)[:16] using the secret from ~/.lingmessage/caller_secret. Caller must be a known 灵族 member.',
    inputSchema: {
      type: 'object',
      properties: {
        caller: {
          type: 'string',
          description: 'Caller identity. Must be a known 灵族 member.',
        },
        identity: {
          type: 'string',
          description: 'Identity string to sign (e.g. "lingxi").',
        },
      },
      required: ['caller', 'identity'],
    },
  },
  async handler(args: unknown): Promise<ToolResult> {
    return handleReadSignature(args);
  },
};
