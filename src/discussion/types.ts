/**
 * Phase B — DiscussionResponder 类型定义
 * RFC v0.2 §Phase B / B-1 骨架草稿
 */

export interface Message {
  rowid: number;
  thread_id: string;
  sender: string;
  body: string | null;
  channel: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface PollConfig {
  channels: string[];
  intervalMs: number;
  batchLimit: number;
  statePath: string;
}

export interface ThreadFilterConfig {
  minReplyIntervalSec: number;
  ownIdentity: string;
  channels?: string[];
}

export interface ReplyConfig {
  dryRun: boolean;
  adapterTimeoutMs: number;
}

export interface ReplyResult {
  success: boolean;
  source: 'adapter' | 'discuss_fallback' | 'none';
  member: string | null;
  error?: string;
}

export interface AuditEntry {
  ts: number;
  event: 'reply_posted' | 'reply_failed' | 'skipped' | 'scan';
  thread_id: string;
  member: string | null;
  source: string;
  dry_run: boolean;
  extra?: Record<string, unknown>;
}

export interface DiscussionStats {
  scans: number;
  new_msgs: number;
  threads_seen: number;
  adapter_replies: number;
  fallback_replies: number;
  skipped: number;
  errors: number;
  audit_writes: number;
}
