/**
 * Phase B — DiscussionResponder 骨架模块
 * RFC v0.2 §Phase B / B-1
 *
 * 核心组件:
 *  - PollManager: 增量扫描 LingBus 新消息
 *  - ThreadFilter: 判断线程是否需要续轮
 *  - ResponderSelect: 轮转选择发言人
 *  - ReplyDispatcher: 执行回复（adapter/fallback）
 *  - AuditLogger: JSONL 审计日志
 */

export { PollManager } from './core/poll_manager.js';
export { ThreadFilter } from './core/thread_filter.js';
export { ResponderSelect, VALID_MEMBERS } from './core/responder_select.js';
export { ReplyDispatcher } from './dispatcher/reply_dispatcher.js';
export { AuditLogger } from './dispatcher/audit_logger.js';

export type {
  Message,
  PollConfig,
  ThreadFilterConfig,
  ReplyConfig,
  ReplyResult,
  AuditEntry,
  DiscussionStats,
} from './types.js';
