/**
 * Ling Shared Decision and Audit Protocol
 * Local copy — eliminates ESM-only @ling/protocol runtime dependency
 */

export enum SourceType {
  VERIFIED = 'verified',
  INFERRED = 'inferred',
  GENERATED = 'generated',
}

export interface SourceTrace {
  type: SourceType;
  timestamp: string;
  origin: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface DecisionRecord {
  timestamp: string;
  command: string;
  reasoning?: string;
  expected_outcome?: string;
  actual_outcome_hash: string;
  success: boolean;
  session_id: string;
  source_trace?: SourceTrace[];
}

export interface BehavioralViolation {
  rule: string;
  message: string;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: Record<string, unknown>;
}

export interface SessionSnapshot {
  session_id: string;
  session_name?: string;
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

export interface BehavioralRule {
  id: string;
  name: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  evaluate: (
    history: DecisionRecord[],
    context: Record<string, unknown>
  ) => BehavioralViolation | null;
}

export interface MetacognitiveAudit {
  audit_id: string;
  timestamp: string;
  session_id: string;
  reasoning_quality_score: number;
  deviation_detected: boolean;
  deviation_type?: string;
  audit_trail: SourceTrace[];
  recommendations: string[];
}
