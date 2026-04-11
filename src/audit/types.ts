/**
 * Audit Trail Types
 * Decision provenance, behavioral contracts, session snapshots
 */

export interface DecisionRecord {
  timestamp: string;
  command: string;
  reasoning: string;
  expected_outcome: string;
  actual_outcome_hash: string;
  success: boolean;
  session_id: string;
}

export interface BehavioralViolation {
  rule: string;
  message: string;
  timestamp: string;
  details: Record<string, unknown>;
}

export interface SessionSnapshot {
  session_id: string;
  session_name: string;
  created_at: string;
  destroyed_at: string;
  duration_seconds: number;
  commands_executed: number;
  directories_accessed: string[];
  files_read: string[];
  files_written: string[];
  network_commands: string[];
  env_changes: Record<string, string>;
  decision_log: DecisionRecord[];
  outcome_deviation_rate: number;
  behavioral_violations: BehavioralViolation[];
}
