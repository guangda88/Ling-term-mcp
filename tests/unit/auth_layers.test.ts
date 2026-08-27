/**
 * L1-L3 三层认证链单元测试
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

// Create unique temp home for each test to prevent cross-test contamination
let tempHome: string;
let originalHome: string;

beforeAll(() => {
  originalHome = process.env.HOME || '';
});

beforeEach(() => {
  jest.resetModules();
  // Generate unique temp home per test to avoid passphrase conflicts
  tempHome = fs.mkdtempSync(
    path.join(process.env.TMPDIR || '/tmp', 'auth-chain-test-')
  );
  process.env.HOME = tempHome;
});

afterEach(() => {
  process.env.HOME = originalHome;
  // Cleanup test temp directory
  if (tempHome && fs.existsSync(tempHome)) {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

afterAll(() => {
  process.env.HOME = originalHome;
  // Defensive cleanup: Jest may leak HOME writes to real home
  const realHome = fs.realpathSync(os.homedir());
  const lingxiDir = path.join(realHome, '.lingxi');
  if (fs.existsSync(lingxiDir)) {
    fs.rmSync(lingxiDir, { recursive: true, force: true });
  }
});

// ─── L1 Layer Tests ───────────────────────────────────────────────────────────

describe('L1 Master Key Layer', () => {
  it('should generate L1 keypair and store encrypted file', async () => {
    const { generateL1Keypair } = await import('../../src/auth/layer1.js');

    const result = await generateL1Keypair.handler({
      caller: 'lingxi',
      passphrase: 'testpassphrase123',
    });

    expect(result.isError).toBeUndefined();
    const response = JSON.parse(result.content[0].text);
    expect(response.ok).toBe(true);
    expect(response.path).toContain('.lingxi/l1_master.key');
    expect(response.public_key_fingerprint).toBeDefined();
  });

  it('should reject unknown caller', async () => {
    const { generateL1Keypair } = await import('../../src/auth/layer1.js');

    const result = await generateL1Keypair.handler({
      caller: 'unknown_member',
      passphrase: 'testpassphrase123',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown caller');
  });

  it('should reject weak passphrase', async () => {
    const { generateL1Keypair } = await import('../../src/auth/layer1.js');

    const result = await generateL1Keypair.handler({
      caller: 'lingxi',
      passphrase: 'weak',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('passphrase must be >= 12');
  });

  it('should reject duplicate keypair generation', async () => {
    const { generateL1Keypair } = await import('../../src/auth/layer1.js');

    // First generation
    await generateL1Keypair.handler({
      caller: 'lingxi',
      passphrase: 'testpassphrase123',
    });

    // Second generation should fail
    const result = await generateL1Keypair.handler({
      caller: 'lingxi',
      passphrase: 'anotherpassphrase123',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('already exists');
  });
});

// ─── L2 Certificate Tests ─────────────────────────────────────────────────────

describe('L2 Certificate Layer', () => {
  it('should create L2 certificate signed by L1', async () => {
    // First generate L1
    const { generateL1Keypair } = await import('../../src/auth/layer1.js');
    await generateL1Keypair.handler({
      caller: 'lingxi',
      passphrase: 'l1passphrase123',
    });

    // Then create L2 cert
    const { createL2Certificate } = await import('../../src/auth/layer2.js');
    const l2Result = await createL2Certificate.handler({
      caller: 'lingxi',
      passphrase: 'l1passphrase123',
      expiry_days: 7,
      scope: ['execute_command'],
    });

    expect(l2Result.isError).toBeUndefined();
    const l2Resp = JSON.parse(l2Result.content[0].text);
    expect(l2Resp.ok).toBe(true);
    expect(l2Resp.l2_certificate).toBeDefined();
    expect(l2Resp.l2_certificate.payload).toBeDefined();
    expect(l2Resp.l2_certificate.signature).toBeDefined();
    expect(l2Resp.l2_private_key).toBeDefined();
  });

  it('should verify valid L2 certificate', async () => {
    const { generateL1Keypair } = await import('../../src/auth/layer1.js');
    await generateL1Keypair.handler({
      caller: 'lingxi',
      passphrase: 'l1passphrase123',
    });

    const { createL2Certificate, verifyL2Certificate } =
      await import('../../src/auth/layer2.js');
    const l2Result = await createL2Certificate.handler({
      caller: 'lingxi',
      passphrase: 'l1passphrase123',
    });
    const l2Resp = JSON.parse(l2Result.content[0].text);

    const verifyResult = await verifyL2Certificate.handler({
      caller: 'lingxi',
      certificate: l2Resp.l2_certificate,
      l1_passphrase: 'l1passphrase123',
    });

    expect(verifyResult.isError).toBeUndefined();
    const verifyResp = JSON.parse(verifyResult.content[0].text);
    expect(verifyResp.ok).toBe(true);
    expect(verifyResp.valid).toBe(true);
  });
});

// ─── L3 Request Signature Tests ───────────────────────────────────────────────

describe('L3 Request Signature Layer', () => {
  let l1KeyData: any;
  let l2Cert: any;
  let l2PrivKey: string;
  let l2PubKey: string;

  beforeEach(async () => {
    const { generateL1Keypair } = await import('../../src/auth/layer1.js');
    const { createL2Certificate } = await import('../../src/auth/layer2.js');
    const tempPassphrase = 'TestPassphrase123!';

    const genResult = await generateL1Keypair.handler({
      caller: 'lingxi',
      passphrase: tempPassphrase,
    });
    l1KeyData = JSON.parse(genResult.content[0].text);
    expect(l1KeyData.ok).toBe(true);

    const l2Result = await createL2Certificate.handler({
      caller: 'lingxi',
      passphrase: tempPassphrase,
      expiry_days: 7,
      scope: ['execute_command'],
    });
    l2Cert = JSON.parse(l2Result.content[0].text);
    expect(l2Cert.ok).toBe(true);
    l2PrivKey = l2Cert.l2_private_key;
    l2PubKey = l2Cert.l2_certificate.payload.l2_pub_pem;
  });

  afterEach(() => {
    // No cleanup needed - temp home is process-scoped
  });

  it('should sign a command request', async () => {
    const { signL3Request } = await import('../../src/auth/layer3.js');
    const result = await signL3Request.handler({
      caller: 'lingxi',
      l2_private_key: l2PrivKey,
      command: 'ls -la',
      args: [],
    });
    expect(result.isError).toBeUndefined();
    const resp = JSON.parse(result.content[0].text);
    expect(resp.ok).toBe(true);
    expect(resp.request.caller).toBe('lingxi');
    expect(resp.request.command).toBe('ls -la');
    expect(resp.request.signature).toBeTruthy();
    expect(resp.request.nonce).toBeTruthy();
    expect(resp.request.timestamp).toBeTruthy();
  });

  it('should verify a valid signed request', async () => {
    const { signL3Request, verifyL3Request } =
      await import('../../src/auth/layer3.js');
    const signResult = await signL3Request.handler({
      caller: 'lingxi',
      l2_private_key: l2PrivKey,
      command: 'ls -la',
      args: [],
    });
    const request = JSON.parse(signResult.content[0].text).request;

    const verifyResult = await verifyL3Request.handler({
      caller: 'lingxi',
      l2_public_key: l2PubKey,
      request,
    });
    expect(verifyResult.isError).toBeUndefined();
    const verifyResp = JSON.parse(verifyResult.content[0].text);
    expect(verifyResp.ok).toBe(true);
    expect(verifyResp.valid).toBe(true);
    expect(verifyResp.caller).toBe('lingxi');
    expect(verifyResp.command).toBe('ls -la');
  });

  it('should reject signature tampering', async () => {
    const { signL3Request, verifyL3Request } =
      await import('../../src/auth/layer3.js');
    const signResult = await signL3Request.handler({
      caller: 'lingxi',
      l2_private_key: l2PrivKey,
      command: 'ls -la',
      args: [],
    });
    const request = JSON.parse(signResult.content[0].text).request;

    // Tamper with the command
    request.command = 'rm -rf /';
    // Update signature for tampered message
    const payload = {
      caller: request.caller,
      command: request.command,
      args: request.args,
      timestamp: request.timestamp,
      nonce: request.nonce,
    };
    request.signature = signWithEd25519(l2PrivKey, JSON.stringify(payload));

    const verifyResult = await verifyL3Request.handler({
      caller: 'lingxi',
      l2_public_key: l2PubKey,
      request,
    });
    expect(verifyResult.isError).toBeUndefined();
    const verifyResp = JSON.parse(verifyResult.content[0].text);
    expect(verifyResp.valid).toBe(false);
  });

  it('should reject wrong public key verification', async () => {
    const { signL3Request, verifyL3Request } =
      await import('../../src/auth/layer3.js');
    const { generateL1Keypair } = await import('../../src/auth/layer1.js');
    const { createL2Certificate } = await import('../../src/auth/layer2.js');

    // Generate a different L2 keypair in a separate temp home
    const otherTempHome = fs.mkdtempSync(
      path.join(process.env.TMPDIR || '/tmp', 'auth-chain-other-')
    );
    const originalHomeBackup = process.env.HOME;
    process.env.HOME = otherTempHome;

    let otherL2Pub = '';
    try {
      const tempPassphrase = 'AnotherPassphrase123!';
      await generateL1Keypair.handler({
        caller: 'lingxi',
        passphrase: tempPassphrase,
      });
      const otherL2Result = await createL2Certificate.handler({
        caller: 'lingxi',
        passphrase: tempPassphrase,
        expiry_days: 7,
        scope: ['execute_command'],
      });
      const otherL2Cert = JSON.parse(otherL2Result.content[0].text);
      otherL2Pub = otherL2Cert.l2_certificate.payload.l2_pub_pem;
    } finally {
      process.env.HOME = originalHomeBackup;
      if (otherTempHome && fs.existsSync(otherTempHome)) {
        fs.rmSync(otherTempHome, { recursive: true, force: true });
      }
    }

    const signResult = await signL3Request.handler({
      caller: 'lingxi',
      l2_private_key: l2PrivKey,
      command: 'ls -la',
      args: [],
    });
    const request = JSON.parse(signResult.content[0].text).request;

    const verifyResult = await verifyL3Request.handler({
      caller: 'lingxi',
      l2_public_key: otherL2Pub,
      request,
    });
    const verifyResp = JSON.parse(verifyResult.content[0].text);
    expect(verifyResp.valid).toBe(false);
  });

  it('should generate unique nonces for each request', async () => {
    const { signL3Request } = await import('../../src/auth/layer3.js');
    const r1 = await signL3Request.handler({
      caller: 'lingxi',
      l2_private_key: l2PrivKey,
      command: 'ls',
      args: [],
    });
    const r2 = await signL3Request.handler({
      caller: 'lingxi',
      l2_private_key: l2PrivKey,
      command: 'ls',
      args: [],
    });
    const n1 = JSON.parse(r1.content[0].text).request.nonce;
    const n2 = JSON.parse(r2.content[0].text).request.nonce;
    expect(n1).not.toBe(n2);
  });

  it('should require caller parameter', async () => {
    const { signL3Request } = await import('../../src/auth/layer3.js');
    const result = await signL3Request.handler({
      l2_private_key: l2PrivKey,
      command: 'ls',
    } as any);
    expect(result.isError).toBe(true);
  });

  it('should require l2_private_key parameter', async () => {
    const { signL3Request } = await import('../../src/auth/layer3.js');
    const result = await signL3Request.handler({
      caller: 'lingxi',
      command: 'ls',
    } as any);
    expect(result.isError).toBe(true);
  });

  it('should require command parameter', async () => {
    const { signL3Request } = await import('../../src/auth/layer3.js');
    const result = await signL3Request.handler({
      caller: 'lingxi',
      l2_private_key: l2PrivKey,
    } as any);
    expect(result.isError).toBe(true);
  });

  it('should reject verify with missing request fields', async () => {
    const { verifyL3Request } = await import('../../src/auth/layer3.js');
    const result = await verifyL3Request.handler({
      caller: 'lingxi',
      l2_public_key: l2PubKey,
      request: {} as any,
    });
    const resp = JSON.parse(result.content[0].text);
    expect(resp.valid).toBe(false);
    expect(resp.reason).toBe('missing_request_fields');
  });

  it('should reject verify with missing caller', async () => {
    const { verifyL3Request } = await import('../../src/auth/layer3.js');
    const result = await verifyL3Request.handler({
      l2_public_key: l2PubKey,
      request: {
        caller: 'lingxi',
        command: 'ls',
        timestamp: new Date().toISOString(),
        nonce: 'test',
        signature: 'test',
      } as any,
    } as any);
    expect(result.isError).toBe(true);
  });
});

function signWithEd25519(privateKey: string, message: string): string {
  return crypto
    .sign(null, Buffer.from(message, 'utf8'), privateKey)
    .toString('base64');
}
