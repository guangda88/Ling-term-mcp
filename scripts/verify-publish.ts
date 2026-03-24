#!/usr/bin/env node

/**
 * Pre-publication Verification Script
 * Verifies that the package is ready for publication
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
}

const results: CheckResult[] = [];

async function runCheck(name: string, check: () => Promise<boolean> | boolean, message: string): Promise<void> {
  const passed = await check();
  results.push({ name, passed, message });
  console.log(`${passed ? '✅' : '❌'} ${name}: ${message}`);
}

async function main() {
  console.log('🔍 Ling-term-mcp Pre-Publication Verification');
  console.log('===============================================\n');

  // Check 1: Required files exist
  await runCheck(
    'Required Files',
    () => {
      const required = [
        'package.json',
        'README.md',
        'LICENSE',
        'dist/index.js',
        'dist/cli.js'
      ];
      return required.every(file => existsSync(file));
    },
    'All required files present'
  );

  // Check 2: Build successful
  await runCheck(
    'Build Status',
    async () => {
      try {
        await execAsync('npm run build');
        return true;
      } catch {
        return false;
      }
    },
    'Project builds successfully'
  );

  // Check 3: TypeScript compilation
  await runCheck(
    'TypeScript Compilation',
    async () => {
      try {
        const { stderr } = await execAsync('npx tsc --noEmit');
        return stderr === '';
      } catch {
        return false;
      }
    },
    'No TypeScript errors'
  );

  // Check 4: Unit tests
  await runCheck(
    'Unit Tests',
    async () => {
      try {
        await execAsync('npm test');
        return true;
      } catch {
        return false;
      }
    },
    'All unit tests passing'
  );

  // Check 5: Package size
  await runCheck(
    'Package Size',
    async () => {
      try {
        const { stdout } = await execAsync('npm pack --dry-run');
        const sizeMatch = stdout.match(/package size:\s+([\d.]+)\s+kB/);
        if (sizeMatch) {
          const size = parseFloat(sizeMatch[1]);
          console.log(`  (Actual size: ${size} kB)`);
          return size < 50; // Should be < 50 kB
        }
        return false;
      } catch {
        return false;
      }
    },
    'Package size under 50 kB'
  );

  // Check 6: License file
  await runCheck(
    'License File',
    () => {
      try {
        const license = readFileSync('LICENSE', 'utf-8');
        return license.includes('MIT License');
      } catch {
        return false;
      }
    },
    'Valid MIT license file'
  );

  // Check 7: README documentation
  await runCheck(
    'README Documentation',
    () => {
      try {
        const readme = readFileSync('README.md', 'utf-8');
        const required = [
          'Install',
          'Usage',
          'API',
          'License',
          '文档',  // Chinese for documentation
          '许可证'  // Chinese for license
        ];
        return required.some(section => readme.includes(section));
      } catch {
        return false;
      }
    },
    'README contains required sections'
  );

  // Check 8: Optimization results
  await runCheck(
    'Optimization Results',
    () => {
      try {
        const results = readFileSync('optimization/optimization_results.json', 'utf-8');
        const data = JSON.parse(results);
        return data.best_score > 0 && data.best_params;
      } catch {
        return false;
      }
    },
    'Optimization results available'
  );

  // Check 9: Git repository
  await runCheck(
    'Git Repository',
    async () => {
      try {
        await execAsync('git rev-parse --git-dir');
        return true;
      } catch {
        return false;
      }
    },
    'Git repository initialized'
  );

  // Check 10: No uncommitted changes
  await runCheck(
    'Working Directory',
    async () => {
      try {
        const { stdout } = await execAsync('git status --porcelain');
        return stdout === '';
      } catch {
        return false;
      }
    },
    'No uncommitted changes'
  );

  // Summary
  console.log('\n📊 Summary');
  console.log('==========');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`Passed: ${passed}/${results.length}`);
  console.log(`Failed: ${failed}/${results.length}\n`);

  if (failed === 0) {
    console.log('✅ All checks passed! Ready for publication.\n');
    console.log('Next steps:');
    console.log('1. Create GitHub repository');
    console.log('2. Push commits: git push -u origin master');
    console.log('3. Create GitHub release (tag: v1.0.0)');
    console.log('4. Publish to npm: npm publish\n');
    process.exit(0);
  } else {
    console.log('❌ Some checks failed. Please fix the issues above before publishing.\n');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
