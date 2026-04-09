/**
 * Performance Monitor Tests
 */

import {
  PerformanceMonitor,
  withPerformanceTracking,
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
});
