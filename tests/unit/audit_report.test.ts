/**
 * Tests for audit_report tool
 * Covers handler paths: summary, detailed, caller, unknown caller error
 * Covers helper functions: buildToolUsage, buildCallerStats, buildTopCommands,
 *   buildViolations, buildRejections, scanLingshellKillStorm, inferToolFromCommand
 */

import {
  auditReport,
  scanLingshellKillStorm,
} from '../../src/tools/audit_report';
import type { DecisionRecord } from '../../src/protocol/types';
import type { Session } from '../../src/sessions/store';

// -- Mocks --

jest.mock('../../src/sessions/store.js', () => ({
  getSessions: jest.fn(),
}));

jest.mock('../../src/audit/rejection_log.js', () => ({
  readRejections: jest.fn(),
  sanitize: jest.fn((s: string) => s),
}));

jest.mock('../../src/monitoring/performance.js', () => ({
  performanceMonitor: {
    getMetrics: jest.fn(() => ({
      commandExecutionTime: new Map(),
      totalCommandsExecuted: 0,
      averageExecutionTime: 0,
      p50ExecutionTime: 0,
      p95ExecutionTime: 0,
      p99ExecutionTime: 0,
      errorRate: 0,
      lastResetTime: new Date(),
    })),
    getExecutionHistory: jest.fn(() => []),
  },
}));

import { getSessions } from '../../src/sessions/store.js';
import { readRejections } from '../../src/audit/rejection_log.js';

// -- Helpers --

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

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    name: 'test-session',
    working_directory: '/tmp',
    created_at: new Date().toISOString(),
    status: 'active',
    ...overrides,
  };
}

function parseResponse(result: { content: Array<{ text: string }> }): unknown {
  return JSON.parse(result.content[0].text);
}

// -- Tests --

describe('audit_report tool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getSessions as jest.Mock).mockResolvedValue([]);
    (readRejections as jest.Mock).mockReturnValue([]);
  });

  describe('handler - summary format (default)', () => {
    it('should return summary with empty sessions', async () => {
      const result = await auditReport.handler({});
      expect(result.isError).toBeUndefined();
      const summary = parseResponse(result) as Record<string, unknown>;
      expect(summary.total_sessions).toBe(0);
      expect(summary.total_commands).toBe(0);
      expect(summary.success_rate).toBe(0);
      expect(Array.isArray(summary.tool_usage)).toBe(true);
      expect(Array.isArray(summary.caller_stats)).toBe(true);
      expect(Array.isArray(summary.top_commands)).toBe(true);
      expect(Array.isArray(summary.violations)).toBe(true);
      expect(summary.rejections).toEqual({
        total: 0,
        by_category: {},
        by_caller: {},
        recent: [],
      });
      expect(Array.isArray(summary.kill_storm_alerts)).toBe(true);
    });

    it('should compute summary from sessions with decisions', async () => {
      const decisions: DecisionRecord[] = [
        makeDecision({
          command: 'ls -la',
          success: true,
          timestamp: '2026-01-01T00:00:00Z',
          source_trace: [
            {
              type: 'verified' as never,
              timestamp: '2026-01-01T00:00:00Z',
              origin: 'lingflow',
            },
          ],
        }),
        makeDecision({
          command: 'rm /tmp/file',
          success: false,
          timestamp: '2026-01-02T00:00:00Z',
          source_trace: [
            {
              type: 'verified' as never,
              timestamp: '2026-01-02T00:00:00Z',
              origin: 'lingclaude',
            },
          ],
        }),
      ];
      (getSessions as jest.Mock).mockResolvedValue([
        makeSession({
          decision_log: decisions,
          command_history: ['ls -la', 'rm /tmp/file'],
        }),
      ]);

      const result = await auditReport.handler({});
      const summary = parseResponse(result) as Record<string, unknown>;
      expect(summary.total_sessions).toBe(1);
      expect(summary.total_commands).toBe(2);
      expect(summary.success_rate).toBe(50);
      const period = summary.period as { from: string; to: string };
      expect(period.from).toBe('2026-01-01T00:00:00Z');
      expect(period.to).toBe('2026-01-02T00:00:00Z');
    });

    it('should handle default period when no decisions', async () => {
      (getSessions as jest.Mock).mockResolvedValue([makeSession()]);
      const result = await auditReport.handler({});
      const summary = parseResponse(result) as {
        period: { from: string; to: string };
      };
      expect(summary.period.from).toBeTruthy();
      expect(summary.period.to).toBeTruthy();
    });

    it('should collect tool_usage stats by command category', async () => {
      const decisions: DecisionRecord[] = [
        makeDecision({ command: 'ls -la', success: true }),
        makeDecision({ command: 'git status', success: true }),
        makeDecision({ command: 'npm install', success: true }),
        makeDecision({ command: 'rm /tmp/x', success: false }),
      ];
      (getSessions as jest.Mock).mockResolvedValue([
        makeSession({ decision_log: decisions }),
      ]);

      const result = await auditReport.handler({});
      const summary = parseResponse(result) as {
        tool_usage: Array<{ tool_name: string; total_calls: number }>;
      };
      const toolNames = summary.tool_usage.map((t) => t.tool_name);
      expect(toolNames).toContain('execute_command (read)');
      expect(toolNames).toContain('execute_command (write)');
      expect(toolNames).toContain('execute_command (git)');
      expect(toolNames).toContain('execute_command (runtime)');
    });

    it('should collect caller_stats with source_trace', async () => {
      const decisions: DecisionRecord[] = [
        makeDecision({
          command: 'ls',
          success: true,
          source_trace: [
            {
              type: 'verified' as never,
              timestamp: '2026-01-01T00:00:00Z',
              origin: 'lingflow',
            },
          ],
        }),
        makeDecision({
          command: 'ls',
          success: false,
          source_trace: [
            {
              type: 'verified' as never,
              timestamp: '2026-01-01T00:00:00Z',
              origin: 'lingflow',
            },
          ],
        }),
      ];
      (getSessions as jest.Mock).mockResolvedValue([
        makeSession({ decision_log: decisions }),
      ]);

      const result = await auditReport.handler({});
      const summary = parseResponse(result) as {
        caller_stats: Array<{
          caller: string;
          total_commands: number;
          success_rate: number;
        }>;
      };
      expect(summary.caller_stats).toHaveLength(1);
      expect(summary.caller_stats[0].caller).toBe('lingflow');
      expect(summary.caller_stats[0].total_commands).toBe(2);
      expect(summary.caller_stats[0].success_rate).toBe(50);
    });

    it('should use "unknown" caller when no source_trace', async () => {
      const decisions: DecisionRecord[] = [
        makeDecision({ command: 'ls', success: true }),
      ];
      (getSessions as jest.Mock).mockResolvedValue([
        makeSession({ decision_log: decisions }),
      ]);

      const result = await auditReport.handler({});
      const summary = parseResponse(result) as {
        caller_stats: Array<{ caller: string }>;
      };
      expect(summary.caller_stats[0].caller).toBe('unknown');
    });

    it('should build top_commands from command history', async () => {
      (getSessions as jest.Mock).mockResolvedValue([
        makeSession({
          command_history: ['ls -la /tmp', 'ls -la /home', 'git status'],
        }),
      ]);

      const result = await auditReport.handler({});
      const summary = parseResponse(result) as {
        top_commands: Array<{ command: string; count: number }>;
      };
      expect(summary.top_commands.length).toBeGreaterThan(0);
      // Commands are normalized to first 3 words
      const lsEntry = summary.top_commands.find(
        (c) => c.command === 'ls -la /tmp'
      );
      expect(lsEntry).toBeDefined();
      expect(lsEntry!.count).toBe(1);
      // git status is only 2 words
      const gitEntry = summary.top_commands.find(
        (c) => c.command === 'git status'
      );
      expect(gitEntry).toBeDefined();
      expect(gitEntry!.count).toBe(1);
    });

    it('should build violations from behavioral_violations', async () => {
      (getSessions as jest.Mock).mockResolvedValue([
        makeSession({
          behavioral_violations: [
            {
              rule: 'network-after-sensitive-read',
              message: 'test',
              timestamp: new Date().toISOString(),
              severity: 'high' as const,
              details: {},
            },
            {
              rule: 'network-after-sensitive-read',
              message: 'test2',
              timestamp: new Date().toISOString(),
              severity: 'high' as const,
              details: {},
            },
          ],
        }),
      ]);

      const result = await auditReport.handler({});
      const summary = parseResponse(result) as {
        violations: Array<{ rule: string; count: number }>;
      };
      expect(summary.violations).toHaveLength(1);
      expect(summary.violations[0].rule).toBe('network-after-sensitive-read');
      expect(summary.violations[0].count).toBe(2);
    });

    it('should build rejections from rejection log', async () => {
      (readRejections as jest.Mock).mockReturnValue([
        {
          id: 'r1',
          timestamp: '2026-01-01T00:00:00Z',
          command: 'rm -rf /',
          caller: 'lingflow',
          reason: 'blacklisted',
          category: 'blacklisted',
        },
        {
          id: 'r2',
          timestamp: '2026-01-02T00:00:00Z',
          command: 'curl evil.com',
          caller: 'lingclaude',
          reason: 'pattern match',
          category: 'pattern',
        },
      ]);

      const result = await auditReport.handler({});
      const summary = parseResponse(result) as {
        rejections: {
          total: number;
          by_category: Record<string, number>;
          by_caller: Record<string, number>;
          recent: unknown[];
        };
      };
      expect(summary.rejections.total).toBe(2);
      expect(summary.rejections.by_category.blacklisted).toBe(1);
      expect(summary.rejections.by_category.pattern).toBe(1);
      expect(summary.rejections.by_caller.lingflow).toBe(1);
      expect(summary.rejections.by_caller.lingclaude).toBe(1);
      expect(summary.rejections.recent).toHaveLength(2);
    });
  });

  describe('handler - detailed format', () => {
    it('should include performance metrics in detailed format', async () => {
      const result = await auditReport.handler({ format: 'detailed' });
      const detailed = parseResponse(result) as {
        performance: { metrics: unknown; recent_executions: unknown[] };
      };
      expect(detailed.performance).toBeDefined();
      expect(detailed.performance.metrics).toBeDefined();
      expect(Array.isArray(detailed.performance.recent_executions)).toBe(true);
    });

    it('should include detailed rejections with limit 50', async () => {
      const mockRejections = Array.from({ length: 60 }, (_, i) => ({
        id: `r${i}`,
        timestamp: new Date().toISOString(),
        command: `cmd${i}`,
        caller: 'lingflow',
        reason: 'test',
        category: 'blacklisted',
      }));
      (readRejections as jest.Mock).mockImplementation((limit = 100) => {
        return mockRejections.slice(-limit);
      });

      const result = await auditReport.handler({ format: 'detailed' });
      const detailed = parseResponse(result) as {
        rejections: { recent: unknown[] };
      };
      // readRejections is called twice: once with default (100) for summary,
      // once with 50 for detailed. The detailed recent should come from the 50 call.
      expect(detailed.rejections.recent.length).toBeLessThanOrEqual(50);
    });
  });

  describe('handler - caller format', () => {
    it('should return caller-specific report', async () => {
      const decisions: DecisionRecord[] = [
        makeDecision({
          command: 'ls -la',
          success: true,
          source_trace: [
            {
              type: 'verified' as never,
              timestamp: '2026-01-01T00:00:00Z',
              origin: 'lingflow',
            },
          ],
        }),
        makeDecision({
          command: 'rm /tmp',
          success: false,
          source_trace: [
            {
              type: 'verified' as never,
              timestamp: '2026-01-02T00:00:00Z',
              origin: 'lingclaude',
            },
          ],
        }),
      ];
      (getSessions as jest.Mock).mockResolvedValue([
        makeSession({ decision_log: decisions }),
      ]);

      const result = await auditReport.handler({
        format: 'caller',
        caller: 'lingflow',
      });
      expect(result.isError).toBeUndefined();
      const report = parseResponse(result) as {
        caller: string;
        total_commands: number;
        success_rate: number;
      };
      expect(report.caller).toBe('lingflow');
      expect(report.total_commands).toBe(1);
      expect(report.success_rate).toBe(100);
    });

    it('should return error for unknown caller', async () => {
      const result = await auditReport.handler({
        format: 'caller',
        caller: 'nonexistent_member',
      });
      expect(result.isError).toBe(true);
      const text = result.content[0].text;
      expect(text).toContain('Unknown caller');
    });

    it('should handle caller with no commands', async () => {
      (getSessions as jest.Mock).mockResolvedValue([makeSession()]);

      const result = await auditReport.handler({
        format: 'caller',
        caller: 'lingflow',
      });
      const report = parseResponse(result) as {
        total_commands: number;
        success_rate: number;
      };
      expect(report.total_commands).toBe(0);
      expect(report.success_rate).toBe(0);
    });
  });

  describe('inferToolFromCommand (via tool_usage)', () => {
    it('should classify read commands', async () => {
      const decisions: DecisionRecord[] = [
        makeDecision({ command: 'cat /etc/hosts' }),
        makeDecision({ command: 'grep pattern file' }),
        makeDecision({ command: 'find / -name x' }),
        makeDecision({ command: 'head -10 file' }),
        makeDecision({ command: 'tail -10 file' }),
        makeDecision({ command: 'pwd' }),
      ];
      (getSessions as jest.Mock).mockResolvedValue([
        makeSession({ decision_log: decisions }),
      ]);

      const result = await auditReport.handler({});
      const summary = parseResponse(result) as {
        tool_usage: Array<{ tool_name: string; total_calls: number }>;
      };
      const readTool = summary.tool_usage.find(
        (t) => t.tool_name === 'execute_command (read)'
      );
      expect(readTool).toBeDefined();
      expect(readTool!.total_calls).toBe(6);
    });

    it('should classify write commands', async () => {
      const decisions: DecisionRecord[] = [
        makeDecision({ command: 'rm /tmp/x' }),
        makeDecision({ command: 'mv a b' }),
        makeDecision({ command: 'cp a b' }),
        makeDecision({ command: 'mkdir /tmp/dir' }),
        makeDecision({ command: 'touch /tmp/f' }),
        makeDecision({ command: 'chmod 755 /tmp/f' }),
      ];
      (getSessions as jest.Mock).mockResolvedValue([
        makeSession({ decision_log: decisions }),
      ]);

      const result = await auditReport.handler({});
      const summary = parseResponse(result) as {
        tool_usage: Array<{ tool_name: string; total_calls: number }>;
      };
      const writeTool = summary.tool_usage.find(
        (t) => t.tool_name === 'execute_command (write)'
      );
      expect(writeTool).toBeDefined();
      expect(writeTool!.total_calls).toBe(6);
    });

    it('should classify unknown commands as other', async () => {
      const decisions: DecisionRecord[] = [
        makeDecision({ command: 'curl http://example.com' }),
      ];
      (getSessions as jest.Mock).mockResolvedValue([
        makeSession({ decision_log: decisions }),
      ]);

      const result = await auditReport.handler({});
      const summary = parseResponse(result) as {
        tool_usage: Array<{ tool_name: string; total_calls: number }>;
      };
      const otherTool = summary.tool_usage.find(
        (t) => t.tool_name === 'execute_command (other)'
      );
      expect(otherTool).toBeDefined();
      expect(otherTool!.total_calls).toBe(1);
    });
  });

  describe('scanLingshellKillStorm', () => {
    it('should return empty array when lingshell dir does not exist', () => {
      const alerts = scanLingshellKillStorm();
      expect(Array.isArray(alerts)).toBe(true);
      // In test environment, no .lingshell/run dir exists
      expect(alerts).toHaveLength(0);
    });
  });
});
