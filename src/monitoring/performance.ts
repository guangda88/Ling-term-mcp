/**
 * Performance Monitoring
 * Tracks and analyzes terminal command performance
 */

import { analyzeInfoDelta, type CommandPair } from './info_delta.js';

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

const MAX_HISTORY_SIZE = 1000;

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
    if (this.executionHistory.length > MAX_HISTORY_SIZE) {
      this.executionHistory = this.executionHistory.slice(-MAX_HISTORY_SIZE);
    }
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
   * Get execution pairs for R5 v7 information gain analysis.
   * Returns the full execution history as CommandPair entries.
   */
  getExecutionPairs(): CommandPair[] {
    return this.executionHistory.map((e) => ({
      command: e.command,
      text: e.error ?? '',
    }));
  }

  /**
   * Run R5 v7 info delta analysis on current execution history.
   * Distinguishes functional iteration from cognitive degradation.
   */
  getInfoDeltaAnalysis() {
    return analyzeInfoDelta(this.getExecutionPairs());
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
