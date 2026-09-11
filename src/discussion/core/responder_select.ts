/**
 * ResponderSelect — 选择续轮发言人（轮转）
 *
 * 算法:
 *  1. 从 thread participants 字段获取参与者列表（兜底从消息 sender 收集）
 *  2. 轮转：从最后发言者的下一位开始
 *  3. 过滤：排除自己、最后发言者、非白名单成员
 */

import { Message } from '../types.js';

// P0 #10 成员白名单 — 与 Python 侧 discussion_listener.py 保持一致
export const VALID_MEMBERS: ReadonlySet<string> = new Set([
  'lingflow',
  'lingclaude',
  'lingresearch',
  'lingzhi',
  'lingtongask',
  'lingxi',
  'lingmessage',
  'lingweb',
  'lingminopt',
  'lingyang',
  'lingcreate',
  'lingan',
]);

export class ResponderSelect {
  /**
   * 选择续轮发言人。
   * @param threadMessages 线程消息（DESC 顺序，最新在前）
   * @param participants 预定义的参与者列表（可选，来自 threads.participants）
   * @param ownIdentity 当前成员标识
   * @returns 选中的成员名，或 null（无合适回复者）
   */
  selectResponder(
    threadMessages: Message[],
    participants?: string[],
    ownIdentity?: string
  ): string | null {
    if (!threadMessages || threadMessages.length === 0) {
      return null;
    }

    // 构建参与者列表
    const candidateList: string[] =
      participants ?? this.collectFromMessages(threadMessages);
    if (candidateList.length === 0) {
      return null;
    }

    const lastSender = threadMessages[0].sender;
    const own = ownIdentity ?? 'lingxi';

    // 轮转：从 lastSender 的下一位开始
    const startIndex = candidateList.indexOf(lastSender);
    const offset =
      startIndex === -1 ? 0 : (startIndex + 1) % candidateList.length;

    for (let i = 0; i < candidateList.length; i++) {
      const candidate = candidateList[(offset + i) % candidateList.length];
      if (candidate === own) continue;
      if (candidate === lastSender) continue;
      if (!VALID_MEMBERS.has(candidate)) continue;
      return candidate;
    }

    return null;
  }

  private collectFromMessages(messages: Message[]): string[] {
    const seen = new Set<string>();
    for (const m of messages) {
      if (m.sender && !seen.has(m.sender)) {
        seen.add(m.sender);
      }
    }
    return Array.from(seen);
  }
}
