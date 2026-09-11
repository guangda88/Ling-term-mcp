/**
 * PollManager — 增量扫描 LingBus 新消息
 *
 * 基于 rowid 游标实现增量拉取，持久化到 statePath，重启不重放。
 */

import * as fs from 'fs';
import * as path from 'path';
import { Message, PollConfig, DiscussionStats } from '../types.js';

export class PollManager {
  private lastRowid: number = 0;
  private readonly config: PollConfig;
  private stats: DiscussionStats = {
    scans: 0,
    new_msgs: 0,
    threads_seen: 0,
    adapter_replies: 0,
    fallback_replies: 0,
    skipped: 0,
    errors: 0,
    audit_writes: 0,
  };
  private lastMessages: Message[] = [];

  constructor(config: PollConfig) {
    this.config = config;
    this.lastRowid = this.loadState();
  }

  private loadState(): number {
    try {
      const data = fs.readFileSync(this.config.statePath, 'utf8');
      const parsed = JSON.parse(data);
      return typeof parsed.last_rowid === 'number' ? parsed.last_rowid : 0;
    } catch {
      return 0;
    }
  }

  saveState(): void {
    try {
      fs.mkdirSync(path.dirname(this.config.statePath), { recursive: true });
      fs.writeFileSync(
        this.config.statePath,
        JSON.stringify({ last_rowid: this.lastRowid }, null, 2),
        { mode: 0o600 }
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[PollManager] saveState failed: ${msg}`);
      this.stats.errors++;
    }
  }

  /**
   * 增量扫描新消息。
   * 调用方需提供 watchChanges(lastRowid, limit) 实现（由 MCP server 注入）。
   */
  async scanOnce(
    watchChanges: (since: number, limit: number) => Promise<Message[]>
  ): Promise<DiscussionStats> {
    this.stats.scans++;
    try {
      const newMsgs = await watchChanges(
        this.lastRowid,
        this.config.batchLimit
      );
      this.lastMessages = newMsgs;
      this.stats.new_msgs += newMsgs.length;
      if (newMsgs.length > 0) {
        this.lastRowid = Math.max(...newMsgs.map((m) => m.rowid));
      }
      return { ...this.stats };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[PollManager] scanOnce failed: ${msg}`);
      this.stats.errors++;
      return { ...this.stats };
    }
  }

  getMessages(): Message[] {
    return this.lastMessages;
  }

  getConfig(): PollConfig {
    return this.config;
  }

  get lastRowidValue(): number {
    return this.lastRowid;
  }

  get statsValue(): DiscussionStats {
    return { ...this.stats };
  }
}
