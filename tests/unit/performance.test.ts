/**
 * Performance Monitor Tests
 */

import {
  PerformanceMonitor,
  withPerformanceTracking,
  LATENCY_BUCKETS,
} from '../../src/monitoring/performance';

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    monitor = new PerformanceMonitor();
  });

  describe('recordExecution', () => {
    it('should record successful execution', () => {
      monitor.recordExecution({
        command: 'ls',
        startTime: 0,
        endTime: 100,
        duration: 100,
        success: true,
      });

      const metrics = monitor.getMetrics();
      expect(metrics.totalCommandsExecuted).toBe(1);
      expect(metrics.averageExecutionTime).toBe(100);
    });

    it('should record failed execution', () => {
      monitor.recordExecution({
        command: 'ls',
        startTime: 0,
        endTime: 50,
        duration: 50,
        success: false,
        error: 'Command failed',
      });

      const metrics = monitor.getMetrics();
      expect(metrics.totalCommandsExecuted).toBe(1);
      expect(metrics.errorRate).toBe(1.0);
    });

    it('should calculate average across multiple executions', () => {
      monitor.recordExecution({
        command: 'ls',
        startTime: 0,
        endTime: 100,
        duration: 100,
        success: true,
      });
      monitor.recordExecution({
        command: 'pwd',
        startTime: 0,
        endTime: 50,
        duration: 50,
        success: true,
      });

      const metrics = monitor.getMetrics();
      expect(metrics.averageExecutionTime).toBe(75);
    });

    it('should separate metrics by command', () => {
      monitor.recordExecution({
        command: 'ls',
        startTime: 0,
        endTime: 100,
        duration: 100,
        success: true,
      });
      monitor.recordExecution({
        command: 'ls',
        startTime: 0,
        endTime: 50,
        duration: 50,
        success: true,
      });
      monitor.recordExecution({
        command: 'pwd',
        startTime: 0,
        endTime: 200,
        duration: 200,
        success: true,
      });

      const lsMetrics = monitor.getCommandMetrics('ls');
      expect(lsMetrics).toHaveLength(2);
      expect(lsMetrics).toEqual(expect.arrayContaining([100, 50]));

      const pwdMetrics = monitor.getCommandMetrics('pwd');
      expect(pwdMetrics).toHaveLength(1);
      expect(pwdMetrics).toEqual([200]);
    });
  });

  describe('getStats', () => {
    it('should calculate correct statistics', () => {
      const stats = (monitor as any).getStats([10, 20, 30, 40, 50]);

      expect(stats.avg).toBe(30);
      expect(stats.min).toBe(10);
      expect(stats.max).toBe(50);
      expect(stats.p50).toBe(30);
    });

    it('should handle empty array', () => {
      const stats = (monitor as any).getStats([]);

      expect(stats.avg).toBe(0);
      expect(stats.p50).toBe(0);
    });
  });

  describe('checkThresholds', () => {
    beforeEach(() => {
      // Record some executions
      for (let i = 0; i < 10; i++) {
        monitor.recordExecution({
          command: 'ls',
          startTime: 0,
          endTime: i * 10,
          duration: i * 10,
          success: true,
        });
      }
    });

    it('should pass when within thresholds', () => {
      const result = monitor.checkThresholds({
        averageExecutionTime: 100,
        p95ExecutionTime: 100,
        errorRate: 0.1,
      });

      expect(result.passed).toBe(true);
      expect(result.failures).toHaveLength(0);
    });

    it('should fail when average exceeds threshold', () => {
      const result = monitor.checkThresholds({
        averageExecutionTime: 10,
      });

      expect(result.passed).toBe(false);
      expect(result.failures).toContainEqual(
        expect.stringContaining('Average execution time')
      );
    });

    it('should fail when error rate exceeds threshold', () => {
      monitor.recordExecution({
        command: 'ls',
        startTime: 0,
        endTime: 10,
        duration: 10,
        success: false,
      });

      const result = monitor.checkThresholds({
        errorRate: 0.05,
      });

      expect(result.passed).toBe(false);
      expect(result.failures).toContainEqual(
        expect.stringContaining('Error rate')
      );
    });
  });

  describe('getReport', () => {
    it('should generate a readable report', () => {
      monitor.recordExecution({
        command: 'ls',
        startTime: 0,
        endTime: 100,
        duration: 100,
        success: true,
      });

      const report = monitor.getReport();

      expect(report).toContain('Performance Report');
      expect(report).toContain('Total Commands Executed: 1');
      expect(report).toContain('ls:');
    });
  });

  describe('reset', () => {
    it('should clear all metrics', () => {
      monitor.recordExecution({
        command: 'ls',
        startTime: 0,
        endTime: 100,
        duration: 100,
        success: true,
      });

      monitor.reset();

      const metrics = monitor.getMetrics();
      expect(metrics.totalCommandsExecuted).toBe(0);
      expect(monitor.getExecutionHistory()).toHaveLength(0);
    });
  });

  describe('withPerformanceTracking', () => {
    it('should wrap async function with tracking', async () => {
      const testMonitor = new PerformanceMonitor();

      const result = await withPerformanceTracking(
        'test-command',
        async () => {
          return 42;
        },
        testMonitor
      );

      expect(result).toBe(42);
      const metrics = testMonitor.getMetrics();
      expect(metrics.totalCommandsExecuted).toBe(1);
    });

    it('should track successful executions', async () => {
      const testMonitor = new PerformanceMonitor();

      await withPerformanceTracking(
        'test-command',
        async () => {
          return 'success';
        },
        testMonitor
      );

      const history = testMonitor.getExecutionHistory();
      expect(history).toHaveLength(1);
      expect(history[0].success).toBe(true);
    });

    it('should track failed executions', async () => {
      const testMonitor = new PerformanceMonitor();

      try {
        await withPerformanceTracking(
          'test-command',
          async () => {
            throw new Error('Test error');
          },
          testMonitor
        );
      } catch (e) {
        // Expected to throw
      }

      const history = testMonitor.getExecutionHistory();
      expect(history).toHaveLength(1);
      expect(history[0].success).toBe(false);
      expect(history[0].error).toBe('Test error');
    });
  });

  describe('LATENCY_BUCKETS', () => {
    it('should have defined latency buckets', () => {
      expect(LATENCY_BUCKETS).toBeDefined();
      expect(LATENCY_BUCKETS.length).toBeGreaterThan(0);
      expect(LATENCY_BUCKETS).toEqual([
        10, 50, 100, 250, 500, 1000, 2500, 5000, 10000,
      ]);
    });
  });
});
