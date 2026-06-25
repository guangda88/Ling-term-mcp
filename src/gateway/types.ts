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

export interface CheckRequest {
  command: string;
  source?: string;
}

export interface CheckResponse {
  command: string;
  category:
    | 'whitelisted'
    | 'red_zone'
    | 'blacklisted'
    | 'authorizable'
    | 'unknown';
  blocked: boolean;
  reason?: string;
  requires_authorization: boolean;
  source?: string;
}

// SEC-001: Meeting auth token types
export interface AuthIssueRequest {
  caller: string;
  agent_id: string;
  meeting_id: string;
  persistent?: boolean;
  max_usage?: number;
}

export interface AuthIssueResponse {
  auth_token: string;
  agent_id: string;
  meeting_id: string;
  scope: string[];
  expires_at: string;
  persistent?: boolean;
  max_usage?: number;
  status: string;
}

export interface AuthVerifyRequest {
  auth_token: string;
  agent_id?: string;
  meeting_id?: string;
}

export interface AuthVerifyResponse {
  valid: boolean;
  scope?: string[];
  agent_id?: string;
  meeting_id?: string;
  reason?: string;
}

// P1-4: Push notification API
export interface NotifyApiRequest {
  target: string;
  message: string;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  source: string;
}

export interface NotifyApiResponse {
  sent: boolean;
  error?: string;
}

// Topic 6: RedZone Check API
export type CheckDecision = 'allow' | 'block' | 'pending_review';

export interface RedZoneCheckRequest {
  operation: string;
  caller: string;
  meeting_id?: string;
  agent_id?: string;
  target_agent?: string;
  reason?: string;
  [key: string]: unknown;
}

export interface RedZoneCheckResponse {
  decision: CheckDecision;
  rule_id?: string;
  reason: string;
  authorization_id?: string;
  score?: number;
  category?: string;
}
