/**
 * Performance Tracker Middleware (onComplete hook)
 * Records command execution duration to the performance monitor.
 */

import type { CompleteHook } from '../pipeline/middleware.js';
import { performanceMonitor } from '../monitoring/performance.js';

export const performanceTracker: CompleteHook = (ctx) => {
  if (!ctx.result) return;
  performanceMonitor.recordExecution({
    command: ctx.command,
    startTime: Date.now() - ctx.result.duration_ms,
    endTime: Date.now(),
    duration: ctx.result.duration_ms,
    success: ctx.result.exit_code === 0,
  });
};
