/**
 * Sandbox Mode Gate Middleware
 * 对齐 dsh `ctx.sandbox` + `SandboxMode` 三态语义:
 *   - danger-full-access: 直通（不调用沙箱，默认行为）
 *   - read-only / workspace-write: 受限模式，必须有沙箱 provider。
 *
 * 灵犀当前未安装 OS 级沙箱后端（无 bwrap/Landlock/Seatbelt provider）。
 * 按 dsh sandbox.md 铁律 "Silent unconfined passthrough is never legal
 * for a confined policy"——受限模式在无 provider 时 fail-closed 拒绝，
 * 绝不静默降级为无沙箱直通。
 */

import type { Middleware } from '../pipeline/middleware.js';
import type { SandboxMode } from '../pipeline/command_ctx.js';
import { logRejection } from '../audit/rejection_log.js';

const CONFINED_MODES: readonly SandboxMode[] = ['read-only', 'workspace-write'];

export const sandboxGate: Middleware = (ctx) => {
  const mode = ctx.sandbox_mode;
  if (!mode || mode === 'danger-full-access') return ctx;
  if (CONFINED_MODES.includes(mode)) {
    logRejection({
      command: ctx.command,
      caller: ctx.caller,
      reason: `Sandbox mode '${mode}' requested but no sandbox provider is installed`,
      category: 'sandbox_unavailable',
      session_id: ctx.session_id,
      shell: ctx.shell,
    });
    ctx.reject(
      `Sandbox mode '${mode}' requires a sandbox provider; none is installed (fail-closed, no silent unconfined passthrough)`,
      'sandbox_unavailable'
    );
  }
  return ctx;
};
