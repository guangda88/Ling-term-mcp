/**
 * Metacognitive Audit Tests
 */

import { performMetacognitiveAudit } from '../../src/audit/metacognitive';
import type { DecisionRecord } from '../../src/protocol/types';

function makeDecision(overrides: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    timestamp: new Date().toISOString(),
    command: 'echo hello',
    reasoning: 'test',
    expected_outcome: 'hello',
    actual_outcome_hash: 'abc123',
    success: true,
    session_id: 'test-session',
    ...overrides,
  };
}

describe('Metacognitive Audit', () => {
  it('should create a valid audit with no decisions', () => {
    const audit = performMetacognitiveAudit([]);
    expect(audit.audit_id).toBeDefined();
    expect(audit.timestamp).toBeDefined();
    expect(audit.session_id).toBe('unknown');
    expect(audit.reasoning_quality_score).toBeGreaterThanOrEqual(0);
    expect(audit.reasoning_quality_score).toBeLessThanOrEqual(100);
    expect(audit.deviation_detected).toBe(false);
    expect(audit.audit_trail).toHaveLength(0);
    expect(audit.recommendations).toHaveLength(1);
  });

  it('should detect low reasoning specificity', () => {
    const decisions = [
      makeDecision({ reasoning: 'hi', expected_outcome: undefined }),
      makeDecision({ reasoning: 'ok', expected_outcome: undefined }),
      makeDecision({ reasoning: 'yep', expected_outcome: undefined }),
    ];
    const audit = performMetacognitiveAudit(decisions);
    expect(audit.deviation_detected).toBe(true);
    expect(audit.deviation_type).toContain('low_specificity');
    expect(audit.recommendations.some((r) => r.includes('specificity'))).toBe(
      true
    );
  });

  it('should detect poor outcome alignment', () => {
    const decisions = [
      makeDecision({ success: false, reasoning: 'this will work' }),
      makeDecision({ success: false, reasoning: 'this also works' }),
      makeDecision({ success: false, reasoning: 'this definitely works' }),
      makeDecision({ success: false, reasoning: 'failed again' }),
    ];
    const audit = performMetacognitiveAudit(decisions);
    expect(audit.deviation_detected).toBe(true);
    expect(audit.deviation_type).toContain('poor_outcome_alignment');
  });

  it('should detect inconsistent reasoning', () => {
    const decisions = [
      makeDecision({
        reasoning: 'execute command for first time with detailed explanation',
      }),
      makeDecision({ reasoning: 'run' }),
      makeDecision({
        reasoning: 'execute another complex operation with long reasoning text',
      }),
      makeDecision({ reasoning: 'do it' }),
      makeDecision({
        reasoning:
          'yet another detailed reasoning with comprehensive explanation',
      }),
    ];
    const audit = performMetacognitiveAudit(decisions);
    expect(audit.deviation_detected).toBe(true);
    expect(audit.deviation_type).toContain('inconsistent_reasoning');
  });

  it('should detect high temporal variation', () => {
    const decisions: DecisionRecord[] = [];
    for (let i = 0; i < 10; i++) {
      decisions.push(
        makeDecision({
          reasoning:
            i % 2 === 0
              ? 'very long reasoning text with lots of details'
              : 'short',
        })
      );
    }
    const audit = performMetacognitiveAudit(decisions);
    expect(audit.deviation_detected).toBe(true);
    expect(audit.deviation_type).toContain('high_temporal_variation');
  });

  it('should calculate reasoning quality score', () => {
    const decisions = [
      makeDecision({
        reasoning: 'Execute ls command to list files in /tmp directory',
        success: true,
      }),
      makeDecision({
        reasoning: 'Run curl to fetch data from example.com',
        success: true,
      }),
    ];
    const audit = performMetacognitiveAudit(decisions);
    expect(audit.reasoning_quality_score).toBeGreaterThan(50);
    expect(audit.deviation_detected).toBe(false);
  });

  it('should create audit trail from decisions', () => {
    const decisions = [
      makeDecision({ success: true, reasoning: 'detailed reasoning' }),
      makeDecision({ success: false, reasoning: 'brief' }),
    ];
    const audit = performMetacognitiveAudit(decisions);
    expect(audit.audit_trail).toHaveLength(2);
    expect(audit.audit_trail[0].type).toBe('verified');
    expect(audit.audit_trail[1].type).toBe('inferred');
    expect(audit.audit_trail[0].confidence).toBe(0.9);
    expect(audit.audit_trail[1].confidence).toBe(0.5);
  });

  it('should accept custom configuration', () => {
    const decisions = [
      makeDecision({
        reasoning: 'ok',
        success: true,
      }),
    ];
    const audit = performMetacognitiveAudit(decisions, {
      minReasoningLength: 5,
      minSpecificityScore: 0.3,
    });
    expect(audit).toBeDefined();
  });

  it('should generate appropriate recommendations', () => {
    const decisions = [
      makeDecision({ reasoning: 'short', success: false }),
      makeDecision({ reasoning: 'brief', success: false }),
      makeDecision({ reasoning: 'tiny', success: false }),
    ];
    const audit = performMetacognitiveAudit(decisions);
    expect(audit.recommendations.length).toBeGreaterThan(1);
    expect(audit.recommendations.some((r) => r.includes('specificity'))).toBe(
      true
    );
    expect(audit.recommendations.some((r) => r.includes('prediction'))).toBe(
      true
    );
  });

  it('should handle missing reasoning gracefully', () => {
    const decisions = [
      makeDecision({ reasoning: undefined }),
      makeDecision({ reasoning: undefined }),
      makeDecision({ reasoning: undefined }),
    ];
    const audit = performMetacognitiveAudit(decisions);
    // With consistent (all undefined) and successful reasoning, score may not be very low
    expect(audit.audit_trail[0].metadata).not.toHaveProperty(
      'reasoning_provided'
    );
    // Deviation should be detected due to low specificity
    expect(audit.deviation_detected).toBe(true);
  });
});
