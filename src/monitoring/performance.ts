/**
 * Performance Monitoring
 * Tracks and analyzes terminal command performance
 */

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  commandExecutionTime: Map<string, number[]>;
  totalCommandsExecuted: number;
  averageExecutionTime: number;
  p50ExecutionTime: number;
  p95ExecutionTime: number;
  p99ExecutionTime: number;
  errorRate: number;
  lastResetTime: Date;
}

/**
 * Execution result
 */
export interface ExecutionResult {
  command: string;
  startTime: number;
  endTime: number;
  duration: number;
  success: boolean;
  error?: string;
}

/**
 * Performance bucket definitions (ms)
 */
export const LATENCY_BUCKETS = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

/**
 * Performance monitor class
 */
export class PerformanceMonitor {
  private executionHistory: ExecutionResult[] = [];
  private metrics: PerformanceMetrics = {
    commandExecutionTime: new Map(),
    totalCommandsExecuted: 0,
    averageExecutionTime: 0,
    p50ExecutionTime: 0,
    p95ExecutionTime: 0,
    p99ExecutionTime: 0,
    errorRate: 0,
    lastResetTime: new Date(),
  };

  /**
   * Record a command execution
   */
  recordExecution(result: ExecutionResult): void {
    this.executionHistory.push(result);
    this.metrics.totalCommandsExecuted++;
    this.recalculateMetrics();
  }

  /**
   * Get current metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Get execution history
   */
  getExecutionHistory(limit?: number): ExecutionResult[] {
    if (limit) {
      return this.executionHistory.slice(-limit);
    }
    return [...this.executionHistory];
  }

  /**
   * Get metrics for a specific command
   */
  getCommandMetrics(command: string): number[] | undefined {
    return this.metrics.commandExecutionTime.get(command);
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.executionHistory = [];
    this.metrics = {
      commandExecutionTime: new Map(),
      totalCommandsExecuted: 0,
      averageExecutionTime: 0,
      p50ExecutionTime: 0,
      p95ExecutionTime: 0,
      p99ExecutionTime: 0,
      errorRate: 0,
      lastResetTime: new Date(),
    };
  }

  /**
   * Get statistics for a set of values
   */
  private getStats(values: number[]): {
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  } {
    if (values.length === 0) {
      return { avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((acc, val) => acc + val, 0);
    const avg = sum / values.length;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];

    const p50Index = Math.floor(sorted.length * 0.5);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);

    return {
      avg,
      min,
      max,
      p50: sorted[p50Index],
      p95: sorted[p95Index],
      p99: sorted[p99Index],
    };
  }

  /**
   * Recalculate metrics from execution history
   */
  private recalculateMetrics(): void {
    const successfulExecutions = this.executionHistory.filter((e) => e.success);
    const durations = successfulExecutions.map((e) => e.duration);

    // Calculate error rate first (before early return)
    const errorCount = this.executionHistory.filter((e) => !e.success).length;
    this.metrics.errorRate =
      this.executionHistory.length > 0
        ? errorCount / this.executionHistory.length
        : 0;

    if (durations.length === 0) {
      // No successful executions, keep error rate but clear other metrics
      this.metrics.averageExecutionTime = 0;
      this.metrics.p50ExecutionTime = 0;
      this.metrics.p95ExecutionTime = 0;
      this.metrics.p99ExecutionTime = 0;
      return;
    }

    const stats = this.getStats(durations);
    this.metrics.averageExecutionTime = stats.avg;
    this.metrics.p50ExecutionTime = stats.p50;
    this.metrics.p95ExecutionTime = stats.p95;
    this.metrics.p99ExecutionTime = stats.p99;

    // Calculate per-command metrics
    const commandGroups = new Map<string, number[]>();
    for (const execution of successfulExecutions) {
      if (!commandGroups.has(execution.command)) {
        commandGroups.set(execution.command, []);
      }
      commandGroups.get(execution.command)!.push(execution.duration);
    }

    this.metrics.commandExecutionTime = commandGroups;
  }

  /**
   * Get performance report
   */
  getReport(): string {
    const metrics = this.getMetrics();
    const lines = [
      '=== Performance Report ===',
      `Total Commands Executed: ${metrics.totalCommandsExecuted}`,
      `Error Rate: ${(metrics.errorRate * 100).toFixed(2)}%`,
      '',
      'Execution Time (ms):',
      `  Average: ${metrics.averageExecutionTime.toFixed(2)}`,
      `  P50: ${metrics.p50ExecutionTime.toFixed(2)}`,
      `  P95: ${metrics.p95ExecutionTime.toFixed(2)}`,
      `  P99: ${metrics.p99ExecutionTime.toFixed(2)}`,
      '',
      'Command Breakdown:',
    ];

    for (const [command, times] of metrics.commandExecutionTime) {
      const stats = this.getStats(times);
      lines.push(
        `  ${command}:`,
        `    Count: ${times.length}`,
        `    Avg: ${stats.avg.toFixed(2)}ms`,
        `    P95: ${stats.p95.toFixed(2)}ms`
      );
    }

    lines.push(`\nLast Reset: ${metrics.lastResetTime.toISOString()}`);

    return lines.join('\n');
  }

  /**
   * Check if performance is within thresholds
   */
  checkThresholds(thresholds: {
    averageExecutionTime?: number;
    p95ExecutionTime?: number;
    p99ExecutionTime?: number;
    errorRate?: number;
  }): {
    passed: boolean;
    failures: string[];
  } {
    const metrics = this.getMetrics();
    const failures: string[] = [];

    if (
      thresholds.averageExecutionTime &&
      metrics.averageExecutionTime > thresholds.averageExecutionTime
    ) {
      failures.push(
        `Average execution time ${metrics.averageExecutionTime.toFixed(2)}ms exceeds threshold ${thresholds.averageExecutionTime}ms`
      );
    }

    if (
      thresholds.p95ExecutionTime &&
      metrics.p95ExecutionTime > thresholds.p95ExecutionTime
    ) {
      failures.push(
        `P95 execution time ${metrics.p95ExecutionTime.toFixed(2)}ms exceeds threshold ${thresholds.p95ExecutionTime}ms`
      );
    }

    if (
      thresholds.p99ExecutionTime &&
      metrics.p99ExecutionTime > thresholds.p99ExecutionTime
    ) {
      failures.push(
        `P99 execution time ${metrics.p99ExecutionTime.toFixed(2)}ms exceeds threshold ${thresholds.p99ExecutionTime}ms`
      );
    }

    if (thresholds.errorRate && metrics.errorRate > thresholds.errorRate) {
      failures.push(
        `Error rate ${(metrics.errorRate * 100).toFixed(2)}% exceeds threshold ${(thresholds.errorRate * 100).toFixed(2)}%`
      );
    }

    return {
      passed: failures.length === 0,
      failures,
    };
  }
}

/**
 * Create a wrapped command execution that records performance
 */
export async function withPerformanceTracking<T>(
  command: string,
  fn: () => Promise<T>,
  monitor: PerformanceMonitor
): Promise<T> {
  const startTime = performance.now();

  try {
    const result = await fn();
    const endTime = performance.now();
    const duration = endTime - startTime;

    monitor.recordExecution({
      command,
      startTime,
      endTime,
      duration,
      success: true,
    });

    return result;
  } catch (error) {
    const endTime = performance.now();
    const duration = endTime - startTime;

    monitor.recordExecution({
      command,
      startTime,
      endTime,
      duration,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();
