/**
 * Audit Trail Tests
 * Decision provenance, behavioral contracts, session snapshots
 */

import { checkBehavioralContracts } from '../../src/audit/contracts';
import { generateSnapshot, hashOutput } from '../../src/audit/snapshot';
import { DecisionRecord } from '../../src/audit/types';

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

describe('hashOutput', () => {
  it('should produce consistent hashes', () => {
    const h1 = hashOutput('hello world');
    const h2 = hashOutput('hello world');
    expect(h1).toBe(h2);
  });

  it('should produce different hashes for different inputs', () => {
    const h1 = hashOutput('hello');
    const h2 = hashOutput('world');
    expect(h1).not.toBe(h2);
  });
});

describe('Behavioral Contracts', () => {
  it('should allow normal commands without violations', () => {
    const decision = makeDecision({ command: 'ls -la' });
    const violations = checkBehavioralContracts(decision, []);
    expect(violations).toHaveLength(0);
  });

  it('should detect network-after-sensitive-read', () => {
    const history: DecisionRecord[] = [
      makeDecision({
        command: 'cat /etc/passwd',
        success: true,
        timestamp: new Date().toISOString(),
      }),
    ];
    const decision = makeDecision({ command: 'curl http://example.com' });
    const violations = checkBehavioralContracts(decision, history);
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0].rule).toBe('network-after-sensitive-read');
  });

  it('should not flag network without prior sensitive read', () => {
    const history: DecisionRecord[] = [
      makeDecision({
        command: 'ls /tmp',
        success: true,
        timestamp: new Date().toISOString(),
      }),
    ];
    const decision = makeDecision({ command: 'curl http://example.com' });
    const violations = checkBehavioralContracts(decision, history);
    const networkViolations = violations.filter(
      (v) => v.rule === 'network-after-sensitive-read'
    );
    expect(networkViolations).toHaveLength(0);
  });

  it('should detect rapid-command-burst', () => {
    const history: DecisionRecord[] = [];
    for (let i = 0; i < 30; i++) {
      history.push(
        makeDecision({
          command: `echo ${i}`,
          session_id: 'test-session',
          timestamp: new Date().toISOString(),
        })
      );
    }
    const decision = makeDecision({ command: 'echo burst' });
    const violations = checkBehavioralContracts(decision, history);
    const burstViolations = violations.filter(
      (v) => v.rule === 'rapid-command-burst'
    );
    expect(burstViolations.length).toBeGreaterThanOrEqual(1);
  });

  it('should detect permission-change-after-write', () => {
    const history: DecisionRecord[] = [
      makeDecision({
        command: 'touch /tmp/testfile',
        success: true,
        timestamp: new Date().toISOString(),
      }),
    ];
    const decision = makeDecision({ command: 'chmod 777 /tmp/testfile' });
    const violations = checkBehavioralContracts(decision, history);
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0].rule).toBe('permission-change-after-write');
  });

  it('should not flag permission change without prior write', () => {
    const history: DecisionRecord[] = [
      makeDecision({
        command: 'ls /tmp',
        success: true,
        timestamp: new Date().toISOString(),
      }),
    ];
    const decision = makeDecision({ command: 'chmod 755 /tmp/somefile' });
    const violations = checkBehavioralContracts(decision, history);
    const permViolations = violations.filter(
      (v) => v.rule === 'permission-change-after-write'
    );
    expect(permViolations).toHaveLength(0);
  });
});

describe('Session Snapshot', () => {
  it('should generate a valid snapshot', () => {
    const decisions: DecisionRecord[] = [
      makeDecision({
        command: 'cat /etc/hosts',
        success: true,
      }),
      makeDecision({
        command: 'curl http://api.example.com/data',
        success: true,
      }),
      makeDecision({
        command: 'mkdir /tmp/testdir',
        success: true,
      }),
      makeDecision({
        command: 'false-command',
        success: false,
      }),
    ];
    const violations = [
      {
        rule: 'network-after-sensitive-read',
        message: 'test violation',
        timestamp: new Date().toISOString(),
        details: {},
      },
    ];

    const snapshot = generateSnapshot(
      'session-1',
      'test-session',
      new Date(Date.now() - 60000).toISOString(),
      decisions,
      violations
    );

    expect(snapshot.session_id).toBe('session-1');
    expect(snapshot.session_name).toBe('test-session');
    expect(snapshot.commands_executed).toBe(4);
    expect(snapshot.network_commands.length).toBeGreaterThanOrEqual(1);
    expect(snapshot.outcome_deviation_rate).toBe(0.25);
    expect(snapshot.behavioral_violations).toHaveLength(1);
    expect(snapshot.duration_seconds).toBeGreaterThanOrEqual(59);
  });

  it('should handle empty decision log', () => {
    const snapshot = generateSnapshot(
      'session-2',
      'empty',
      new Date().toISOString(),
      [],
      []
    );
    expect(snapshot.commands_executed).toBe(0);
    expect(snapshot.outcome_deviation_rate).toBe(0);
    expect(snapshot.network_commands).toHaveLength(0);
    expect(snapshot.behavioral_violations).toHaveLength(0);
  });
});
