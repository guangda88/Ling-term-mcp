/**
 * sandboxGate — 三态文件效应沙箱模式单元测试
 * 对齐 dsh SandboxMode: read-only / workspace-write / danger-full-access
 */

import { executeCommand } from '../../src/tools/execute_command';
import { sandboxGate } from '../../src/middleware/sandbox';
import { createCommandCtx } from '../../src/pipeline/command_ctx';
import { saveSession, clearSessions } from '../../src/sessions/store';

beforeEach(async () => {
  await clearSessions();
});

describe('sandboxGate middleware (三态)', () => {
  it('danger-full-access: 直通不拒绝', async () => {
    const ctx = createCommandCtx({
      command: 'echo',
      args: ['hi'],
      caller: 'lingxi',
      sandbox_mode: 'danger-full-access',
    });
    sandboxGate(ctx);
    expect(ctx.rejected).toBe(false);
  });

  it('默认（未指定）: 直通不拒绝', async () => {
    const ctx = createCommandCtx({ command: 'echo', caller: 'lingxi' });
    sandboxGate(ctx);
    expect(ctx.rejected).toBe(false);
  });

  it('read-only: 无 provider fail-closed 拒绝', async () => {
    const ctx = createCommandCtx({
      command: 'echo',
      caller: 'lingxi',
      sandbox_mode: 'read-only',
    });
    sandboxGate(ctx);
    expect(ctx.rejected).toBe(true);
    expect(ctx.rejectCategory).toBe('sandbox_unavailable');
    expect(ctx.rejectReason).toMatch(/no sandbox provider|fail-closed/i);
  });

  it('workspace-write: 无 provider fail-closed 拒绝', async () => {
    const ctx = createCommandCtx({
      command: 'echo',
      caller: 'lingxi',
      sandbox_mode: 'workspace-write',
    });
    sandboxGate(ctx);
    expect(ctx.rejected).toBe(true);
    expect(ctx.rejectCategory).toBe('sandbox_unavailable');
  });
});

describe('execute_command + sandbox_mode (端到端)', () => {
  it('sandbox_mode=danger-full-access: 命令正常执行', async () => {
    const result = await executeCommand.handler({
      command: 'echo',
      args: ['ok'],
      caller: 'lingxi',
      sandbox_mode: 'danger-full-access',
    });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('ok');
  });

  it('sandbox_mode=read-only: 拒绝且报错信息含沙箱说明', async () => {
    await expect(
      executeCommand.handler({
        command: 'echo',
        caller: 'lingxi',
        sandbox_mode: 'read-only',
      })
    ).rejects.toThrow(/sandbox|Sandbox/i);
  });

  it('sandbox_mode=workspace-write: 拒绝', async () => {
    await expect(
      executeCommand.handler({
        command: 'echo',
        caller: 'lingxi',
        sandbox_mode: 'workspace-write',
      })
    ).rejects.toThrow(/sandbox|Sandbox/i);
  });

  it('session_id + sandbox_mode 组合不冲突', async () => {
    await saveSession({
      id: 'sandbox-session',
      name: 'test',
      working_directory: '/tmp',
      created_at: new Date().toISOString(),
      status: 'active',
    });
    const result = await executeCommand.handler({
      command: 'pwd',
      session_id: 'sandbox-session',
      caller: 'lingxi',
      sandbox_mode: 'danger-full-access',
    });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('/tmp');
  });
});
