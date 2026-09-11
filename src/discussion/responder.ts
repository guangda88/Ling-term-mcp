/**
 * DiscussionResponder — Phase B 核心编排类
 *
 * 串联 PollManager → ThreadFilter → ResponderSelect → ReplyDispatcher
 *
 * 用法:
 *   const responder = new DiscussionResponder({ channels: ['governance', 'ecosystem'] });
 *   const stats = await responder.scanOnce();
 *   responder.run({ intervalMs: 60_000 }); // 常驻循环
 */

import { PollManager } from './core/poll_manager.js';
import { ThreadFilter } from './core/thread_filter.js';
import { ResponderSelect } from './core/responder_select.js';
import { ReplyDispatcher } from './dispatcher/reply_dispatcher.js';
import { AuditLogger } from './dispatcher/audit_logger.js';
import os from 'os';
import path from 'path';
import type { Message, DiscussionStats } from './types.js';

export interface ResponderConfig {
  /** 监听频道，默认 ['governance', 'ecosystem'] */
  channels?: string[];
  /** 轮询间隔 ms，默认 60_000 */
  intervalMs?: number;
  /** 每次最多拉取消息数，默认 200 */
  batchLimit?: number;
  /** 同一线程最小回复间隔秒，默认 300 */
  minReplyIntervalSec?: number;
  /** 当前成员标识，默认 'lingxi' */
  ownIdentity?: string;
  /** 是否 dry_run，默认 true */
  dryRun?: boolean;
  /** 游标持久化路径 */
  statePath?: string;
  /** 审计日志路径 */
  auditPath?: string;
}

interface AdapterCall {
  (member: string, context: string): Promise<string | null>;
}

export class DiscussionResponder {
  private readonly poll: PollManager;
  private readonly filter: ThreadFilter;
  private readonly selector: ResponderSelect;
  private readonly dispatcher: ReplyDispatcher;
  private readonly audit: AuditLogger;
  private readonly ownIdentity: string;
  private readonly adapterCall: AdapterCall;
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    config: ResponderConfig = {},
    adapterCall: AdapterCall = defaultNoopAdapter
  ) {
    this.ownIdentity = config.ownIdentity ?? 'lingxi';
    this.adapterCall = adapterCall;
    const channels = config.channels ?? ['governance', 'ecosystem'];

    this.poll = new PollManager({
      channels,
      intervalMs: config.intervalMs ?? 60_000,
      batchLimit: config.batchLimit ?? 200,
      statePath: config.statePath ?? this.defaultStatePath(),
    });

    this.filter = new ThreadFilter({
      minReplyIntervalSec: config.minReplyIntervalSec ?? 300,
      ownIdentity: this.ownIdentity,
      channels,
    });

    this.dispatcher = new ReplyDispatcher(
      { dryRun: config.dryRun ?? true, adapterTimeoutMs: 30_000 },
      config.auditPath
    );
    this.audit = this.dispatcher.audit;
    this.selector = new ResponderSelect();
  }

  private defaultStatePath(): string {
    return path.join(
      os.homedir(),
      '.lingxi',
      'discussion_responder_state.json'
    );
  }

  /**
   * 单次扫描：拉取新消息 → 过滤 → 选择回复者 → 执行回复
   */
  async scanOnce(): Promise<DiscussionStats> {
    const pollStats = await this.poll.scanOnce(this.fetchMessages.bind(this));

    // 获取新消息并分组
    const newMsgs = this.poll.getMessages();
    const byThread = this.groupByThread(newMsgs);

    for (const [threadId, msgs] of byThread) {
      if (msgs.length === 0) continue;

      this.audit.append({
        ts: Date.now() / 1000,
        event: 'scan',
        thread_id: threadId,
        member: null,
        source: 'responder',
        dry_run: this.isDryRun(),
      });

      // 按 timestamp 排序，取最新在前
      const sorted = [...msgs].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      const lastMsg = sorted[sorted.length - 1];

      if (!this.filter.shouldRespond(threadId, lastMsg)) {
        this.audit.append({
          ts: Date.now() / 1000,
          event: 'skipped',
          thread_id: threadId,
          member: null,
          source: 'filter',
          dry_run: this.isDryRun(),
        });
        continue;
      }

      const member = this.selector.selectResponder(sorted);
      if (!member) continue;

      const context = this.buildContext(sorted);
      const result = await this.dispatcher.dispatch(
        threadId,
        member,
        context,
        this.adapterCall
      );
      if (result.success) {
        this.filter.recordReply(threadId);
      }
    }

    this.poll.saveState();
    return { ...pollStats };
  }

  /**
   * 常驻循环，定期扫描
   */
  run(config?: { intervalMs?: number }): void {
    if (this.running) return;
    this.running = true;
    const interval = config?.intervalMs ?? this.poll['config'].intervalMs;
    this.timer = setInterval(() => {
      this.scanOnce().catch((err) => {
        console.error(`[DiscussionResponder] scan error: ${err}`);
      });
    }, interval);
    // 立即执行一次
    this.scanOnce().catch(console.error);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  get stats(): DiscussionStats {
    return this.poll.statsValue;
  }

  get auditLog(): AuditLogger {
    return this.audit;
  }

  get lastRowid(): number {
    return this.poll.lastRowidValue;
  }

  get isDryRunMode(): boolean {
    return this.isDryRun();
  }

  // ─── Private helpers ───────────────────────────────────────────────

  private async fetchMessages(
    since: number,
    limit: number
  ): Promise<Message[]> {
    try {
      const { callMcpTool } = await import('../lib/mcp_client.js');
      const result = (await callMcpTool('http://127.0.0.1:9528/mcp', 'admin', {
        command: 'watch',
        since_rowid: since,
        limit,
      })) as any;
      const changes = result?.changes ?? [];
      return changes.map((m: any) => ({
        rowid: m.rowid,
        thread_id: m.thread_id,
        sender: m.sender,
        body: m.body ?? null,
        channel: m.channel,
        timestamp: m.timestamp ?? new Date().toISOString(),
        metadata: m.metadata,
      }));
    } catch (err) {
      console.error(`[DiscussionResponder] fetchMessages failed: ${err}`);
      return [];
    }
  }

  private groupByThread(msgs: Message[]): Map<string, Message[]> {
    const map = new Map<string, Message[]>();
    for (const m of msgs) {
      const arr = map.get(m.thread_id) ?? [];
      arr.push(m);
      map.set(m.thread_id, arr);
    }
    return map;
  }

  private buildContext(msgs: Message[]): string {
    // 取最近 8 条，按时间升序拼接
    const recent = msgs.slice(-8);
    return recent.map((m) => `${m.sender}: ${m.body ?? ''}`).join('\n');
  }

  private isDryRun(): boolean {
    return this.dispatcher['config'].dryRun;
  }
}

async function defaultNoopAdapter(
  _member: string,
  _context: string
): Promise<string | null> {
  return null;
}
