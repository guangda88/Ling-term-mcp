export type CommandPriority = 'normal' | 'high' | 'critical';
export type CommandStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'rejected';

export interface DispatchRequest {
  command: string;
  session_id?: string | null;
  cwd?: string;
  shell?: boolean;
  timeout?: number;
  source: string;
  reasoning: string;
  expected_outcome?: string;
  priority?: CommandPriority;
  callback_url?: string | null;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
  output_hash: string;
}

export interface DispatchResponse {
  request_id: string;
  status: CommandStatus;
  session_id: string;
  result?: CommandResult;
  rejection_reason?: string;
}

export interface GatewayStatus {
  status: string;
  active_commands: number;
  sessions: number;
  uptime_s: number;
  pending_queue: number;
}

export interface CancelRequest {
  request_id: string;
  source: string;
}

export interface CancelResponse {
  cancelled: boolean;
  reason?: string;
}

export interface HistoryEntry {
  request_id: string;
  command: string;
  source: string;
  status: CommandStatus;
  started_at: string;
  completed_at?: string;
  exit_code?: number;
}

export interface HistoryResponse {
  commands: HistoryEntry[];
}

export interface SourceRateLimit {
  count: number;
  resetAt: number;
}
