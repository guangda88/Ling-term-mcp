/**
 * ThreadFilter — 判断线程是否需要续轮
 *
 * 过滤规则:
 *  1. 频道过滤：仅允许的频道
 *  2. 自答检测：最后消息是自己发的 → 跳过
 *  3. 频率保护：距离上次回复 < minReplyInterval → 跳过
 */

import { Message, ThreadFilterConfig } from '../types.js';

export class ThreadFilter {
  private readonly config: ThreadFilterConfig;
  private readonly lastReplyAt: Map<string, number> = new Map();

  constructor(config: ThreadFilterConfig) {
    this.config = config;
  }

  /**
   * 判断线程是否需要续轮。
   * @returns false = 跳过，true = 需要处理
   */
  shouldRespond(threadId: string, lastMsg: Message): boolean {
    // 1. 频道过滤
    if (!this.config.channels?.includes(lastMsg.channel)) {
      return false;
    }

    // 2. 自答检测
    if (lastMsg.sender === this.config.ownIdentity) {
      return false;
    }

    // 3. 频率保护
    const now = Date.now() / 1000;
    const lastReply = this.lastReplyAt.get(threadId) ?? 0;
    if (now - lastReply < this.config.minReplyIntervalSec) {
      return false;
    }

    return true;
  }

  recordReply(threadId: string): void {
    this.lastReplyAt.set(threadId, Date.now() / 1000);
  }

  clearReply(threadId: string): void {
    this.lastReplyAt.delete(threadId);
  }
}
