/**
 * T6 caller_secret 下发工具 — 单元测试
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  distributeCallerSecret,
  readCallerSignature,
} from '../../src/tools/caller_secret';

describe('caller_secret tools', () => {
  let tmpDir: string;
  let tmpSecretPath: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caller_secret_test_'));
    tmpSecretPath = path.join(tmpDir, 'caller_secret');
    originalEnv = process.env['LINGMESSAGE_CALLER_SECRET_FILE'];
    process.env['LINGMESSAGE_CALLER_SECRET_FILE'] = tmpSecretPath;
    delete process.env['LINGMESSAGE_CALLER_SECRET'];
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env['LINGMESSAGE_CALLER_SECRET_FILE'] = originalEnv;
    } else {
      delete process.env['LINGMESSAGE_CALLER_SECRET_FILE'];
    }
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('distribute_caller_secret', () => {
    it('rejects unknown caller', async () => {
      const res = await distributeCallerSecret.handler({
        caller: 'unknown_bot',
        secret: 'mysecret',
      });
      expect(res.isError).toBe(true);
      expect((res.content[0] as { text: string }).text).toContain(
        'Unknown caller'
      );
    });

    it('rejects missing secret', async () => {
      const res = await distributeCallerSecret.handler({ caller: 'lingxi' });
      expect(res.isError).toBe(true);
      expect((res.content[0] as { text: string }).text).toContain('No secret');
    });

    it('writes secret file with mode 0600', async () => {
      const res = await distributeCallerSecret.handler({
        caller: 'lingxi',
        secret: 'my-test-secret-12345',
      });
      expect(res.isError).toBeFalsy();
      expect(fs.existsSync(tmpSecretPath)).toBe(true);
      const content = fs.readFileSync(tmpSecretPath, 'utf8');
      expect(content).toBe('my-test-secret-12345');
      const st = fs.statSync(tmpSecretPath);
      expect((st.mode & 0o777).toString(8)).toBe('600');
      const body = JSON.parse((res.content[0] as { text: string }).text);
      expect(body.ok).toBe(true);
      expect(body.mode).toBe('0600');
      expect(body.overwritten).toBe(false);
    });

    it('reads secret from env when arg not provided', async () => {
      process.env['LINGMESSAGE_CALLER_SECRET'] = 'env-secret-abc';
      const res = await distributeCallerSecret.handler({ caller: 'lingxi' });
      expect(res.isError).toBeFalsy();
      const content = fs.readFileSync(tmpSecretPath, 'utf8');
      expect(content).toBe('env-secret-abc');
    });

    it('refuses overwrite without force flag', async () => {
      fs.writeFileSync(tmpSecretPath, 'existing', { mode: 0o600 });
      const res = await distributeCallerSecret.handler({
        caller: 'lingxi',
        secret: 'new-secret',
      });
      expect(res.isError).toBe(true);
      expect((res.content[0] as { text: string }).text).toContain(
        'already exists'
      );
      const content = fs.readFileSync(tmpSecretPath, 'utf8');
      expect(content).toBe('existing');
    });

    it('overwrites with force=true', async () => {
      fs.writeFileSync(tmpSecretPath, 'existing', { mode: 0o600 });
      const res = await distributeCallerSecret.handler({
        caller: 'lingxi',
        secret: 'new-secret',
        force: true,
      });
      expect(res.isError).toBeFalsy();
      const content = fs.readFileSync(tmpSecretPath, 'utf8');
      expect(content).toBe('new-secret');
      const body = JSON.parse((res.content[0] as { text: string }).text);
      expect(body.overwritten).toBe(true);
    });

    it('accepts all 12 灵族 members', async () => {
      const members = [
        'lingflow',
        'lingclaude',
        'lingresearch',
        'lingzhi',
        'lingtongask',
        'lingflow_plus',
        'lingxi',
        'lingmessage',
        'lingweb',
        'lingminopt',
        'lingyang',
        'lingcreate',
      ];
      for (const m of members) {
        const target = path.join(tmpDir, `${m}_secret`);
        process.env['LINGMESSAGE_CALLER_SECRET_FILE'] = target;
        const res = await distributeCallerSecret.handler({
          caller: m,
          secret: `${m}-secret`,
        });
        expect(res.isError).toBeFalsy();
        expect(fs.existsSync(target)).toBe(true);
      }
    });
  });

  describe('read_caller_signature', () => {
    it('rejects unknown caller', async () => {
      const res = await readCallerSignature.handler({
        caller: 'fake',
        identity: 'lingxi',
      });
      expect(res.isError).toBe(true);
    });

    it('requires identity arg', async () => {
      const res = await readCallerSignature.handler({ caller: 'lingxi' });
      expect(res.isError).toBe(true);
      expect((res.content[0] as { text: string }).text).toContain('identity');
    });

    it('returns error when secret file missing', async () => {
      const res = await readCallerSignature.handler({
        caller: 'lingxi',
        identity: 'lingxi',
      });
      expect(res.isError).toBe(true);
      expect((res.content[0] as { text: string }).text).toContain('not found');
    });

    it('computes stable HMAC-SHA256 signature', async () => {
      fs.writeFileSync(tmpSecretPath, 'fixed-secret', { mode: 0o600 });
      const r1 = await readCallerSignature.handler({
        caller: 'lingxi',
        identity: 'lingxi',
      });
      const r2 = await readCallerSignature.handler({
        caller: 'lingxi',
        identity: 'lingxi',
      });
      expect(r1.isError).toBeFalsy();
      const b1 = JSON.parse((r1.content[0] as { text: string }).text);
      const b2 = JSON.parse((r2.content[0] as { text: string }).text);
      expect(b1.signature).toBe(b2.signature);
      expect(b1.signature).toMatch(/^[0-9a-f]{16}$/);
      expect(b1.algorithm).toBe('HMAC-SHA256');
      expect(b1.truncated).toBe(true);
    });

    it('produces different signatures for different identities', async () => {
      fs.writeFileSync(tmpSecretPath, 'shared-secret', { mode: 0o600 });
      const r1 = await readCallerSignature.handler({
        caller: 'lingxi',
        identity: 'lingxi',
      });
      const r2 = await readCallerSignature.handler({
        caller: 'lingxi',
        identity: 'lingclaude',
      });
      const b1 = JSON.parse((r1.content[0] as { text: string }).text);
      const b2 = JSON.parse((r2.content[0] as { text: string }).text);
      expect(b1.signature).not.toBe(b2.signature);
    });

    it('produces different signatures for different secrets', async () => {
      fs.writeFileSync(tmpSecretPath, 'secret-v1', { mode: 0o600 });
      const r1 = await readCallerSignature.handler({
        caller: 'lingxi',
        identity: 'lingxi',
      });
      fs.writeFileSync(tmpSecretPath, 'secret-v2', { mode: 0o600 });
      const r2 = await readCallerSignature.handler({
        caller: 'lingxi',
        identity: 'lingxi',
      });
      const b1 = JSON.parse((r1.content[0] as { text: string }).text);
      const b2 = JSON.parse((r2.content[0] as { text: string }).text);
      expect(b1.signature).not.toBe(b2.signature);
    });
  });

  describe('tool definitions', () => {
    it('distribute includes required fields', () => {
      const d = distributeCallerSecret.definition;
      expect(d.name).toBe('distribute_caller_secret');
      expect(d.description).toContain('RED ZONE');
      expect(d.inputSchema.required).toContain('caller');
    });
    it('read signature includes required fields', () => {
      const d = readCallerSignature.definition;
      expect(d.name).toBe('read_caller_signature');
      expect(d.inputSchema.required).toContain('caller');
      expect(d.inputSchema.required).toContain('identity');
    });
  });
});
