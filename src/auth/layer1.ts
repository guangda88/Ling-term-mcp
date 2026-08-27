/**
 * L1 Master Key Layer — Ed25519 keypair management
 *
 * Storage: ~/.lingxi/l1_master.key (mode 0400)
 * Format: salt(16) || iv(12) || authTag(16) || ciphertext
 * Encryption: PBKDF2-SHA256(passphrase, salt, 100k) → AES-256-GCM
 *
 * Tools:
 *   - generate_l1_keypair: Generate + encrypt + store L1 master keypair
 *   - export_l1_public_key: Decrypt L1.priv, export L1.pub as PEM
 *   - import_l1_keypair: Restore L1 from decrypted JSON backup
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { isKnownMember } from '../security/identity.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface L1KeyData {
  publicKey: string; // PEM spki
  privateKey: string; // PEM pkcs8
}

interface EncryptedL1File {
  version: number;
  algo: string; // 'aes-256-gcm'
  kdf: string; // 'pbkdf2-sha256'
  kdfParams: { iterations: number; dkLen: number };
  encrypted: string; // base64(salt||iv||tag||ciphertext)
}

// ─── Constants ────────────────────────────────────────────────────────────────

const L1_DIR = '.lingxi';
const L1_FILE = 'l1_master.key';
const PBKDF2_ITERATIONS = 100_000;
const DK_LEN = 32; // AES-256 key length

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function l1KeyPath(): string {
  return path.join(process.env.HOME || os.homedir(), L1_DIR, L1_FILE);
}

function auditLog(caller: string, operation: string, detail: string): void {
  console.error(
    `[L1] ${new Date().toISOString()} caller=${caller} op=${operation} ${detail}`
  );
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(
    passphrase,
    salt,
    PBKDF2_ITERATIONS,
    DK_LEN,
    'sha256'
  );
}

function encryptKeyPair(
  keyData: L1KeyData,
  passphrase: string
): EncryptedL1File {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(passphrase, salt);

  const plaintext = JSON.stringify(keyData);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();

  const stored = Buffer.concat([salt, iv, authTag, encrypted]);
  return {
    version: 1,
    algo: 'aes-256-gcm',
    kdf: 'pbkdf2-sha256',
    kdfParams: { iterations: PBKDF2_ITERATIONS, dkLen: DK_LEN },
    encrypted: stored.toString('base64'),
  };
}

function decryptKeyPair(
  encryptedFile: EncryptedL1File,
  passphrase: string
): L1KeyData {
  const stored = Buffer.from(encryptedFile.encrypted, 'base64');
  const salt = stored.slice(0, 16);
  const iv = stored.slice(16, 28);
  const authTag = stored.slice(28, 44);
  const ciphertext = stored.slice(44);

  const key = deriveKey(passphrase, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return JSON.parse(decrypted.toString('utf8')) as L1KeyData;
}

function readEncryptedFile(): EncryptedL1File | null {
  const p = l1KeyPath();
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw) as EncryptedL1File;
}

function writeEncryptedFile(data: EncryptedL1File): void {
  const p = l1KeyPath();
  fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 });
  fs.writeFileSync(p, json(data), { encoding: 'utf8', mode: 0o400 });
}

// ─── Tool Handlers ────────────────────────────────────────────────────────────

interface GenerateL1Args {
  caller: string;
  passphrase: string;
}

function handleGenerateL1(rawArgs: unknown): ToolResult {
  const a = (rawArgs ?? {}) as GenerateL1Args;
  const caller = a.caller;

  if (!caller || typeof caller !== 'string') {
    return {
      content: [{ type: 'text', text: 'Error: caller is required' }],
      isError: true,
    };
  }
  if (!isKnownMember(caller)) {
    auditLog(caller, 'generate_l1', 'unknown_caller');
    return {
      content: [{ type: 'text', text: `Error: Unknown caller: ${caller}` }],
      isError: true,
    };
  }
  if (!a.passphrase || a.passphrase.length < 12) {
    auditLog(caller, 'generate_l1', 'weak_passphrase');
    return {
      content: [
        {
          type: 'text',
          text: 'Error: passphrase must be >= 12 characters',
        },
      ],
      isError: true,
    };
  }

  const exists = fs.existsSync(l1KeyPath());
  if (exists) {
    auditLog(caller, 'generate_l1', 'already_exists');
    return {
      content: [
        {
          type: 'text',
          text: `Error: L1 master key already exists at ${l1KeyPath()}. Use --force to overwrite.`,
        },
      ],
      isError: true,
    };
  }

  try {
    // Generate Ed25519 keypair
    const kp = crypto.generateKeyPairSync('ed25519');
    const keyData: L1KeyData = {
      publicKey: String(kp.publicKey.export({ format: 'pem', type: 'spki' })),
      privateKey: String(
        kp.privateKey.export({ format: 'pem', type: 'pkcs8' })
      ),
    };

    // Encrypt and store
    const encrypted = encryptKeyPair(keyData, a.passphrase);
    writeEncryptedFile(encrypted);

    auditLog(caller, 'generate_l1', 'success');
    return {
      content: [
        {
          type: 'text',
          text: json({
            ok: true,
            path: l1KeyPath(),
            public_key_fingerprint: crypto
              .createHash('sha256')
              .update(keyData.publicKey)
              .digest('hex')
              .slice(0, 16),
            message:
              'L1 master key generated and encrypted. Store your passphrase securely — it cannot be recovered.',
          }),
        },
      ],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    auditLog(caller, 'generate_l1', `error:${msg}`);
    return {
      content: [{ type: 'text', text: `Error: ${msg}` }],
      isError: true,
    };
  }
}

interface ExportL1PubArgs {
  caller: string;
  passphrase: string;
}

function handleExportL1Pub(rawArgs: unknown): ToolResult {
  const a = (rawArgs ?? {}) as ExportL1PubArgs;
  const caller = a.caller;

  if (!caller || typeof caller !== 'string') {
    return {
      content: [{ type: 'text', text: 'Error: caller is required' }],
      isError: true,
    };
  }
  if (!isKnownMember(caller)) {
    auditLog(caller, 'export_l1_pub', 'unknown_caller');
    return {
      content: [{ type: 'text', text: `Error: Unknown caller: ${caller}` }],
      isError: true,
    };
  }
  if (!a.passphrase) {
    auditLog(caller, 'export_l1_pub', 'missing_passphrase');
    return {
      content: [
        {
          type: 'text',
          text: 'Error: passphrase is required to decrypt L1 key',
        },
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
          text: `Error: L1 key not found at ${l1KeyPath()}. Run generate_l1_keypair first.`,
        },
      ],
      isError: true,
    };
  }

  try {
    const keyData = decryptKeyPair(encrypted, a.passphrase);
    auditLog(caller, 'export_l1_pub', 'success');
    return {
      content: [
        {
          type: 'text',
          text: json({
            ok: true,
            public_key_pem: keyData.publicKey,
            caller,
          }),
        },
      ],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    auditLog(caller, 'export_l1_pub', `error:${msg}`);
    return {
      content: [
        { type: 'text', text: `Error: Failed to decrypt L1 key: ${msg}` },
      ],
      isError: true,
    };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export const generateL1Keypair = {
  definition: {
    name: 'generate_l1_keypair',
    description:
      '[RED ZONE] Generate Ed25519 master keypair, encrypt with PBKDF2-SHA256 + AES-256-GCM, store at ~/.lingxi/l1_master.key (mode 0400). Passphrase must be >= 12 chars and cannot be recovered.',
    inputSchema: {
      type: 'object',
      properties: {
        caller: { type: 'string', description: 'Must be a known 灵族 member.' },
        passphrase: {
          type: 'string',
          description: 'Passphrase >= 12 characters for PBKDF2 encryption.',
        },
      },
      required: ['caller', 'passphrase'],
    },
  },
  handler: handleGenerateL1,
};

export const exportL1PublicKey = {
  definition: {
    name: 'export_l1_public_key',
    description:
      'Decrypt L1 master key and export public key PEM. Requires passphrase. Caller must be a known 灵族 member.',
    inputSchema: {
      type: 'object',
      properties: {
        caller: { type: 'string', description: 'Must be a known 灵族 member.' },
        passphrase: {
          type: 'string',
          description: 'Passphrase to decrypt L1 key.',
        },
      },
      required: ['caller', 'passphrase'],
    },
  },
  handler: handleExportL1Pub,
};

export { l1KeyPath, readEncryptedFile, decryptKeyPair, encryptKeyPair };
