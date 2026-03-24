/**
 * Stress Testing Scenarios
 * Test Ling-term-mcp under heavy load
 */

import { spawn } from 'node:child_process';
import path from 'node:path';

const CLI_PATH = path.resolve('dist/cli.js');

/**
 * Execute a command via CLI
 */
async function executeCommand(args: string[]): Promise<{
  status: number | null;
  stdout: string;
  stderr: string;
  duration: number;
}> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const child = spawn('node', [CLI_PATH, ...args]);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => {
      stdout += chunk;
    });

    child.stderr.on('data', chunk => {
      stderr += chunk;
    });

    child.on('close', status => {
      const duration = Date.now() - startTime;
      resolve({ status, stdout, stderr, duration });
    });
  });
}

/**
 * Test scenario: Execute 100 commands concurrently
 */
export const concurrent100Scenario = async () => {
  console.log('🧪 Running: 100 concurrent commands test');

  const commands = Array(100).fill('echo test');
  const startTime = Date.now();

  const results = await Promise.all(commands.map((cmd, i) =>
    executeCommand(['execute', `${cmd} ${i}`])
  ));

  const endTime = Date.now();
  const duration = endTime - startTime;

  const successful = results.filter(r => r.status === 0).length;
  const failed = results.filter(r => r.status !== 0).length;
  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;

  console.log(`✅ Completed in ${duration}ms`);
  console.log(`   Success: ${successful}/100`);
  console.log(`   Failed: ${failed}/100`);
  console.log(`   Avg response time: ${avgDuration.toFixed(2)}ms`);

  if (failed > 5) {
    throw new Error(`Too many failures: ${failed}/100`);
  }

  if (avgDuration > 1000) {
    throw new Error(`Average response time too high: ${avgDuration.toFixed(2)}ms`);
  }

  return { successful, failed, avgDuration, duration };
};

/**
 * Test scenario: Execute 1000 commands sequentially
 */
export const sequential1000Scenario = async () => {
  console.log('🧪 Running: 1000 sequential commands test');

  const startTime = Date.now();
  let successful = 0;
  let failed = 0;
  const durations: number[] = [];

  for (let i = 0; i < 1000; i++) {
    const result = await executeCommand(['execute', 'echo sequential']);
    durations.push(result.duration);

    if (result.status === 0) {
      successful++;
    } else {
      failed++;
    }

    // Print progress every 100
    if ((i + 1) % 100 === 0) {
      console.log(`   Progress: ${i + 1}/1000`);
    }
  }

  const endTime = Date.now();
  const duration = endTime - startTime;
  const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
  const maxDuration = Math.max(...durations);
  const minDuration = Math.min(...durations);

  console.log(`✅ Completed in ${duration}ms`);
  console.log(`   Success: ${successful}/1000`);
  console.log(`   Failed: ${failed}/1000`);
  console.log(`   Avg duration: ${avgDuration.toFixed(2)}ms`);
  console.log(`   Min duration: ${minDuration}ms`);
  console.log(`   Max duration: ${maxDuration}ms`);

  if (failed > 10) {
    throw new Error(`Too many failures: ${failed}/1000`);
  }

  return { successful, failed, avgDuration, maxDuration, minDuration, duration };
};

/**
 * Test scenario: Memory stability under load
 */
export const memoryStabilityScenario = async () => {
  console.log('🧪 Running: Memory stability test');

  // Run commands repeatedly and check if memory grows
  const iterations = 500;
  const memorySnapshots: number[] = [];

  for (let i = 0; i < iterations; i++) {
    await executeCommand(['execute', 'echo memory-test']);

    // Record memory usage every 100 iterations
    if (i % 100 === 0) {
      const memUsage = process.memoryUsage();
      memorySnapshots.push(memUsage.heapUsed);
    }
  }

  console.log(`✅ Completed ${iterations} iterations`);
  console.log(`   Memory snapshots: ${memorySnapshots.length}`);

  // Check for memory leaks (memory should not grow continuously)
  if (memorySnapshots.length >= 3) {
    const firstThird = memorySnapshots.slice(0, Math.floor(memorySnapshots.length / 3));
    const lastThird = memorySnapshots.slice(-Math.floor(memorySnapshots.length / 3));

    const avgFirst = firstThird.reduce((sum, val) => sum + val, 0) / firstThird.length;
    const avgLast = lastThird.reduce((sum, val) => sum + val, 0) / lastThird.length;
    const growthPercent = ((avgLast - avgFirst) / avgFirst) * 100;

    console.log(`   Initial avg heap: ${(avgFirst / 1024 / 1024).toFixed(2)}MB`);
    console.log(`   Final avg heap: ${(avgLast / 1024 / 1024).toFixed(2)}MB`);
    console.log(`   Memory growth: ${growthPercent.toFixed(2)}%`);

    if (growthPercent > 50) {
      throw new Error(`Possible memory leak detected: ${growthPercent.toFixed(2)}% growth`);
    }
  }

  return { memorySnapshots };
};

/**
 * Test scenario: Long-running commands
 */
export const longRunningScenario = async () => {
  console.log('🧪 Running: Long-running command test');

  const command = 'sleep 0.1'; // 100ms delay
  const iterations = 50;
  const durations: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const result = await executeCommand(['execute', command]);
    durations.push(result.duration);
  }

  const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
  const maxDuration = Math.max(...durations);

  console.log(`✅ Completed ${iterations} iterations`);
  console.log(`   Avg duration: ${avgDuration.toFixed(2)}ms`);
  console.log(`   Max duration: ${maxDuration}ms`);

  if (maxDuration > 5000) {
    throw new Error(`Max duration too high: ${maxDuration}ms`);
  }

  return { avgDuration, maxDuration };
};

/**
 * Run all stress tests
 */
export const runAllStressTests = async () => {
  console.log('🚀 Starting Stress Testing Suite\n');

  const results = {
    concurrent100: null as any,
    sequential1000: null as any,
    memoryStability: null as any,
    longRunning: null as any,
  };

  try {
    results.concurrent100 = await concurrent100Scenario();
    console.log();
  } catch (error) {
    console.error('❌ Concurrent 100 test failed:', error);
  }

  try {
    results.sequential1000 = await sequential1000Scenario();
    console.log();
  } catch (error) {
    console.error('❌ Sequential 1000 test failed:', error);
  }

  try {
    results.memoryStability = await memoryStabilityScenario();
    console.log();
  } catch (error) {
    console.error('❌ Memory stability test failed:', error);
  }

  try {
    results.longRunning = await longRunningScenario();
    console.log();
  } catch (error) {
    console.error('❌ Long-running test failed:', error);
  }

  console.log('📊 Stress Testing Summary:');
  console.log('====================');
  console.log(`Concurrent 100: ${results.concurrent100 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Sequential 1000: ${results.sequential1000 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Memory stability: ${results.memoryStability ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Long-running: ${results.longRunning ? '✅ PASS' : '❌ FAIL'}`);

  const allPassed =
    results.concurrent100 &&
    results.sequential1000 &&
    results.memoryStability &&
    results.longRunning;

  if (!allPassed) {
    process.exit(1);
  }

  console.log('\n✨ All stress tests passed!');
  return results;
};

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllStressTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
