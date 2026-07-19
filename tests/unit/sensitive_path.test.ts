/**
 * Sensitive Path Gate (P0.5) — conformance tests
 *
 * 5 guard types per LingAn conformance protocol:
 *   1. match_whitelist  (sensitive path → ask/deny)
 *   2. match_blacklist  (cross-member write → ask)
 *   3. match_grayzone   (cross-member read → allow if whitelisted, else ask)
 *   4. match_dualsign   (config/secrets → require dual approval)
 *   5. match_always_allow (in-workspace read → proceed)
 */

import {
  resetSensitivePathConfig,
  sensitivePathGate,
} from '../../src/middleware/sensitive_path';

interface MockContext {
  command: string;
  commandForValidation: string;
  caller: string;
  shell: boolean;
  rejected: boolean;
  rejectReason?: string;
  rejectCategory?: string;
  reject(reason: string, category?: string): void;
}

function makeCtx(args: { command: string; caller: string }): MockContext {
  const ctx: MockContext = {
    command: args.command,
    commandForValidation: args.command,
    caller: args.caller,
    shell: true,
    rejected: false,
    reject(reason: string, category?: string) {
      ctx.rejected = true;
      ctx.rejectReason = reason;
      ctx.rejectCategory = category;
    },
  };
  return ctx;
}

describe('sensitive_path gate (P0.5)', () => {
  beforeEach(() => {
    resetSensitivePathConfig();
  });

  test('in-workspace read (cat) is allowed', () => {
    const ctx = makeCtx({
      command: 'cat /home/ai/lingxi/src/foo.ts',
      caller: 'lingxi',
    });
    sensitivePathGate(ctx);
    expect(ctx.rejected).toBe(false);
  });

  test('in-workspace write (rm) requires allowed_paths', () => {
    const ctx = makeCtx({
      command: 'rm /home/ai/lingxi/secret.txt',
      caller: 'lingxi',
    });
    sensitivePathGate(ctx);
    expect(ctx.rejected).toBe(true);
    expect(ctx.rejectCategory).toBe('in_workspace_write');
  });

  test('cross-member read (cat) is blocked by default', () => {
    const ctx = makeCtx({
      command: 'cat /home/ai/lingresearch/foo.txt',
      caller: 'lingxi',
    });
    sensitivePathGate(ctx);
    expect(ctx.rejected).toBe(true);
    expect(ctx.rejectCategory).toBe('cross_member');
  });

  test('cross-member write (rm) is always blocked', () => {
    const ctx = makeCtx({
      command: 'rm /home/ai/lingresearch/foo.txt',
      caller: 'lingxi',
    });
    sensitivePathGate(ctx);
    expect(ctx.rejected).toBe(true);
    expect(ctx.rejectCategory).toBe('cross_member');
  });

  test('sensitive path (security_registry.yaml) is always rejected', () => {
    const ctx = makeCtx({
      command: 'cat /home/ai/lingxi/security_registry.yaml',
      caller: 'lingxi',
    });
    sensitivePathGate(ctx);
    expect(ctx.rejected).toBe(true);
    expect(ctx.rejectCategory).toBe('sensitive_path');
  });

  test('sensitive path (.env) is always rejected', () => {
    const ctx = makeCtx({
      command: 'cat /home/ai/lingxi/.env',
      caller: 'lingxi',
    });
    sensitivePathGate(ctx);
    expect(ctx.rejected).toBe(true);
    expect(ctx.rejectCategory).toBe('sensitive_path');
  });

  test('/tmp access is allowed', () => {
    const ctx = makeCtx({ command: 'cat /tmp/test.txt', caller: 'lingxi' });
    sensitivePathGate(ctx);
    expect(ctx.rejected).toBe(false);
  });

  test('lingxi own src/ read is allowed (default config)', () => {
    const ctx = makeCtx({
      command: 'cat /home/ai/lingxi/src/security/validator.ts',
      caller: 'lingxi',
    });
    sensitivePathGate(ctx);
    expect(ctx.rejected).toBe(false);
  });

  test('unknown caller rejected on cross-member', () => {
    const ctx = makeCtx({
      command: 'cat /home/ai/lingresearch/foo.txt',
      caller: 'unknown_caller',
    });
    sensitivePathGate(ctx);
    expect(ctx.rejected).toBe(true);
  });

  test('in-workspace read of .env (sensitive) is rejected', () => {
    const ctx = makeCtx({
      command: 'cat /home/ai/lingxi/.env',
      caller: 'lingxi',
    });
    sensitivePathGate(ctx);
    expect(ctx.rejected).toBe(true);
    expect(ctx.rejectCategory).toBe('sensitive_path');
  });

  test('no target path → allow', () => {
    const ctx = makeCtx({ command: 'echo hello', caller: 'lingxi' });
    sensitivePathGate(ctx);
    expect(ctx.rejected).toBe(false);
  });
});
