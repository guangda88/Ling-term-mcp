/**
 * L2 Certificate Layer — Cross-signed cert for daemon-to-daemon auth
 *
 * Format:
 *   L2.cert = Ed25519_sign(L1.priv, L2.pub || expiry || issuer_id || scope)
 *
 * Validation:
 *   Ed25519_verify(L1.pub, signature, L2.pub || expiry || issuer_id || scope)
 *
 * Tools:
 *   - create_l2_cert: Generate L2 keypair, create cert signed by L1, return both
 *   - verify_l2_cert: Verify L2 cert against L1.pub without decrypting L1.priv
 */

import * as crypto from 'crypto';
import { isKnownMember } from '../security/identity.js';
import { readEncryptedFile, decryptKeyPair } from './layer1.js';

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

function json(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function auditLog(caller: string, operation: string, detail: string): void {
  console.error(
    `[L2] ${new Date().toISOString()} caller=${caller} op=${operation} ${detail}`
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface L2CertPayload {
  l2_pub_pem: string;
  issuer_id: string; // L1 member who issued this cert
  expiry_iso: string; // ISO 8601 timestamp
  scope: string[]; // allowed operations
}

interface L2Cert {
  payload: L2CertPayload;
  signature: string; // base64 Ed25519 signature
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createCertPayload(
  l2Pub: string,
  issuerId: string,
  expiryDays: number,
  scope: string[]
): L2CertPayload {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + expiryDays);
  return {
    l2_pub_pem: l2Pub,
    issuer_id: issuerId,
    expiry_iso: expiry.toISOString(),
    scope,
  };
}

function signCert(payload: L2CertPayload, l1Priv: string): string {
  const msg = json(payload);
  return crypto.sign(null, Buffer.from(msg, 'utf8'), l1Priv).toString('base64');
}

function verifyCertSignature(
  payload: L2CertPayload,
  signature: string,
  l1Pub: string
): boolean {
  const msg = json(payload);
  const sigBuf = Buffer.from(signature, 'base64');
  try {
    return crypto.verify(null, Buffer.from(msg, 'utf8'), l1Pub, sigBuf);
  } catch {
    return false;
  }
}

function isCertExpired(payload: L2CertPayload): boolean {
  return new Date(payload.expiry_iso) < new Date();
}

// ─── Tool Handlers ────────────────────────────────────────────────────────────

interface CreateL2CertArgs {
  caller: string;
  passphrase: string;
  expiry_days?: number;
  scope?: string[];
}

function handleCreateL2Cert(rawArgs: unknown): ToolResult {
  const a = (rawArgs ?? {}) as CreateL2CertArgs;
  const caller = a.caller;

  if (!caller || typeof caller !== 'string') {
    return {
      content: [{ type: 'text', text: 'Error: caller is required' }],
      isError: true,
    };
  }
  if (!isKnownMember(caller)) {
    auditLog(caller, 'create_l2_cert', 'unknown_caller');
    return {
      content: [{ type: 'text', text: `Error: Unknown caller: ${caller}` }],
      isError: true,
    };
  }
  if (!a.passphrase) {
    auditLog(caller, 'create_l2_cert', 'missing_passphrase');
    return {
      content: [
        { type: 'text', text: 'Error: passphrase required to decrypt L1 key' },
      ],
      isError: true,
    };
  }

  const encrypted = readEncryptedFile();
  if (!encrypted) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: L1 master key not found. Run generate_l1_keypair first.`,
        },
      ],
      isError: true,
    };
  }

  try {
    // Decrypt L1
    const l1Keys = decryptKeyPair(encrypted, a.passphrase);

    // Generate L2 keypair
    const kp = crypto.generateKeyPairSync('ed25519');
    const l2Pub = String(kp.publicKey.export({ format: 'pem', type: 'spki' }));
    const l2Priv = String(
      kp.privateKey.export({ format: 'pem', type: 'pkcs8' })
    );

    // Create cert payload
    const payload = createCertPayload(
      l2Pub,
      caller,
      a.expiry_days ?? 7,
      a.scope ?? ['execute_command']
    );

    // Sign with L1.priv
    const signature = signCert(payload, l1Keys.privateKey);

    auditLog(caller, 'create_l2_cert', 'success');
    return {
      content: [
        {
          type: 'text',
          text: json({
            ok: true,
            l2_certificate: {
              payload,
              signature,
            },
            l2_private_key: l2Priv,
            message:
              'Store l2_private_key securely. It is NOT encrypted — use only in memory or encrypt separately.',
          }),
        },
      ],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    auditLog(caller, 'create_l2_cert', `error:${msg}`);
    return {
      content: [{ type: 'text', text: `Error: ${msg}` }],
      isError: true,
    };
  }
}

interface VerifyL2CertArgs {
  caller: string;
  certificate: L2Cert;
  l1_passphrase: string;
}

function handleVerifyL2Cert(rawArgs: unknown): ToolResult {
  const a = (rawArgs ?? {}) as VerifyL2CertArgs;
  const caller = a.caller;
  const cert = a.certificate;

  if (!caller || typeof caller !== 'string') {
    return {
      content: [{ type: 'text', text: 'Error: caller is required' }],
      isError: true,
    };
  }
  if (!isKnownMember(caller)) {
    auditLog(caller, 'verify_l2_cert', 'unknown_caller');
    return {
      content: [{ type: 'text', text: `Error: Unknown caller: ${caller}` }],
      isError: true,
    };
  }
  if (!cert || !cert.payload || !cert.signature) {
    return {
      content: [
        {
          type: 'text',
          text: 'Error: certificate must have payload and signature',
        },
      ],
      isError: true,
    };
  }
  if (!a.l1_passphrase) {
    return {
      content: [{ type: 'text', text: 'Error: l1_passphrase is required' }],
      isError: true,
    };
  }

  // Get L1 public key by decrypting L1
  const encrypted = readEncryptedFile();
  if (!encrypted) {
    return {
      content: [{ type: 'text', text: 'Error: L1 key not found' }],
      isError: true,
    };
  }
  const l1Keys = decryptKeyPair(encrypted, a.l1_passphrase);

  // Check expiry
  if (isCertExpired(cert.payload)) {
    auditLog(caller, 'verify_l2_cert', 'expired');
    return {
      content: [
        {
          type: 'text',
          text: json({
            ok: false,
            valid: false,
            reason: 'certificate_expired',
            expiry_iso: cert.payload.expiry_iso,
          }),
        },
      ],
      isError: true,
    };
  }

  // Verify signature
  const valid = verifyCertSignature(
    cert.payload,
    cert.signature,
    l1Keys.publicKey
  );

  auditLog(caller, 'verify_l2_cert', valid ? 'verified' : 'invalid_signature');
  return {
    content: [
      {
        type: 'text',
        text: json({
          ok: true,
          valid,
          caller,
          issuer_id: cert.payload.issuer_id,
          expiry_iso: cert.payload.expiry_iso,
          scope: cert.payload.scope,
        }),
      },
    ],
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const createL2Certificate = {
  definition: {
    name: 'create_l2_certificate',
    description:
      '[RED ZONE] Generate L2 keypair and create certificate signed by L1 master key. Returns L2 private key (insecure — store securely) and L2 certificate (payload + signature). Caller must provide L1 passphrase.',
    inputSchema: {
      type: 'object',
      properties: {
        caller: { type: 'string', description: 'Must be a known 灵族 member.' },
        passphrase: {
          type: 'string',
          description: 'L1 passphrase for decryption.',
        },
        expiry_days: {
          type: 'number',
          description: 'Certificate validity in days. Default: 7.',
        },
        scope: {
          type: 'array',
          items: { type: 'string' },
          description: 'Allowed operations. Default: ["execute_command"].',
        },
      },
      required: ['caller', 'passphrase'],
    },
  },
  handler: handleCreateL2Cert,
};

export const verifyL2Certificate = {
  definition: {
    name: 'verify_l2_certificate',
    description:
      'Verify L2 certificate signature against L1 public key. Requires L1 passphrase.',
    inputSchema: {
      type: 'object',
      properties: {
        caller: { type: 'string', description: 'Must be a known 灵族 member.' },
        certificate: {
          type: 'object',
          description: 'L2 certificate with payload and signature.',
        },
        l1_passphrase: { type: 'string', description: 'L1 passphrase.' },
      },
      required: ['caller', 'certificate', 'l1_passphrase'],
    },
  },
  handler: handleVerifyL2Cert,
};

export { createCertPayload, signCert, verifyCertSignature, isCertExpired };
