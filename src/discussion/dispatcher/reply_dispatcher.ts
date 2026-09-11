/**
 * ReplyDispatcher — 执行回复（adapter 主路径 / LLM fallback）
 *
 * 执行流程:
 *  1. 尝试调用成员 adapter（通过 MCP tool dispatch）
 *  2. 若 adapter 不可用/离线 → LLM fallback（TypeScript 侧暂无 LLM 能力，返回 null）
 *  3. 写回 LingBus（带 metadata.source 标记）
 *  4. 记录审计日志
 */

import { ReplyConfig, ReplyResult } from '../types.js';
import { AuditLogger } from './audit_logger.js';

export class ReplyDispatcher {
  private readonly config: ReplyConfig;
  private readonly _audit: AuditLogger;

  constructor(config: Partial<ReplyConfig> = {}, auditPath?: string) {
    this.config = {
      dryRun: true, // 默认 dry_run，需显式开启
      adapterTimeoutMs: 30_000,
      ...config,
    };
    this._audit = new AuditLogger(auditPath);
  }

  /**
   * 执行回复。
   * @returns ReplyResult 包含 success/source/member/error
   */
  async dispatch(
    threadId: string,
    member: string,
    context: string,
    callAdapter: (member: string, context: string) => Promise<string | null>
  ): Promise<ReplyResult> {
    // 主路径：调用 adapter
    let reply: string | null = null;
    try {
      reply = await callAdapter(member, context);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ReplyDispatcher] adapter call failed: ${msg}`);
      this.audit.append({
        ts: Date.now() / 1000,
        event: 'reply_failed',
        thread_id: threadId,
        member,
        source: 'adapter',
        dry_run: this.config.dryRun,
        extra: { error: msg },
      });
      return { success: false, source: 'none', member: null, error: msg };
    }

    if (!reply || reply.trim().length === 0) {
      // adapter 返回空 → fallback 未实现（TypeScript 侧无 LLM）
      this.audit.append({
        ts: Date.now() / 1000,
        event: 'reply_failed',
        thread_id: threadId,
        member,
        source: 'discuss_fallback',
        dry_run: this.config.dryRun,
        extra: { reason: 'empty_reply' },
      });
      return { success: false, source: 'none', member };
    }

    // 写回 LingBus（dry_run 模式下仅记录）
    if (this.config.dryRun) {
      this.audit.append({
        ts: Date.now() / 1000,
        event: 'reply_posted',
        thread_id: threadId,
        member,
        source: 'adapter',
        dry_run: true,
        extra: { reply_len: reply.length, suppressed: true },
      });
      return { success: true, source: 'adapter', member };
    }

    // TODO: 实际调用 post_reply MCP tool
    // 当前仅记录审计，待 B-2 阶段集成
    this.audit.append({
      ts: Date.now() / 1000,
      event: 'reply_posted',
      thread_id: threadId,
      member,
      source: 'adapter',
      dry_run: false,
      extra: { reply_len: reply.length },
    });

    return { success: true, source: 'adapter', member };
  }

  get audit(): AuditLogger {
    return this._audit;
  }
}
