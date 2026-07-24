/**
 * Tests for L10 Operation Gate - protected file write gate
 */

import {
  isProtected,
  requiresSource,
  checkWrite,
  getProtectedPatterns,
  getRequireSourcePatterns,
  type WriteIntent,
} from '../../src/layers/l10_operation_gate';

function makeIntent(overrides: Partial<WriteIntent> = {}): WriteIntent {
  return {
    filePath: '',
    content: '',
    author: 'lingxi',
    commitMessage: '',
    sourceUrl: '',
    sourceRecordId: '',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('isProtected', () => {
  it('should flag routes.json as protected', () => {
    expect(isProtected('routes.json')).toBe(true);
    expect(isProtected('/home/ai/llm-proxy/routes.json')).toBe(true);
  });

  it('should flag providers.json as protected', () => {
    expect(isProtected('providers.json')).toBe(true);
  });

  it('should flag config.yaml as protected', () => {
    expect(isProtected('config.yaml')).toBe(true);
    expect(isProtected('config.yml')).toBe(true);
  });

  it('should flag CRUSH.md as protected', () => {
    expect(isProtected('CRUSH.md')).toBe(true);
    expect(isProtected('/home/ai/lingxi/CRUSH.md')).toBe(true);
  });

  it('should flag security_registry.yaml as protected', () => {
    expect(isProtected('security_registry.yaml')).toBe(true);
  });

  it('should flag backends.json as protected', () => {
    expect(isProtected('backends.json')).toBe(true);
  });

  it('should flag .audit files as protected', () => {
    expect(isProtected('.audit/2026-07-24.md')).toBe(true);
  });

  it('should not flag regular files', () => {
    expect(isProtected('README.md')).toBe(false);
    expect(isProtected('package.json')).toBe(false);
    expect(isProtected('src/index.ts')).toBe(false);
    expect(isProtected('tests/unit/test.ts')).toBe(false);
  });
});

describe('requiresSource', () => {
  it('should require source for routes.json', () => {
    expect(requiresSource('routes.json')).toBe(true);
  });

  it('should require source for providers.json', () => {
    expect(requiresSource('providers.json')).toBe(true);
  });

  it('should require source for config.yaml', () => {
    expect(requiresSource('config.yaml')).toBe(true);
  });

  it('should require source for security_registry.yaml', () => {
    expect(requiresSource('security_registry.yaml')).toBe(true);
  });

  it('should require source for backends.json', () => {
    expect(requiresSource('backends.json')).toBe(true);
  });

  it('should not require source for CRUSH.md', () => {
    expect(requiresSource('CRUSH.md')).toBe(false);
  });

  it('should not require source for .audit files', () => {
    expect(requiresSource('.audit/test.md')).toBe(false);
  });
});

describe('checkWrite', () => {
  it('should pass for non-protected files', () => {
    const intent = makeIntent({
      filePath: 'README.md',
      content: '# Hello',
    });
    const result = checkWrite(intent);
    expect(result.passed).toBe(true);
  });

  it('should pass for protected files without source requirement', () => {
    const intent = makeIntent({
      filePath: 'CRUSH.md',
      content: '# CRUSH',
    });
    const result = checkWrite(intent);
    expect(result.passed).toBe(true);
    expect(result.protectedFile).toBe(true);
  });

  it('should pass for protected files with source URL', () => {
    const intent = makeIntent({
      filePath: 'routes.json',
      content: '{}',
      commitMessage: 'source: https://example.com/data',
    });
    const result = checkWrite(intent);
    expect(result.passed).toBe(true);
    expect(result.reason).toContain('source verified');
  });

  it('should pass for protected files with lm_create record ID', () => {
    const intent = makeIntent({
      filePath: 'routes.json',
      content: '{}',
      commitMessage:
        'lm_create record_id: a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    });
    const result = checkWrite(intent);
    expect(result.passed).toBe(true);
  });

  it('should pass for protected files with reference URL', () => {
    const intent = makeIntent({
      filePath: 'config.yaml',
      content: 'key: value',
      commitMessage: '参考: https://lingbus/thread/abc',
    });
    const result = checkWrite(intent);
    expect(result.passed).toBe(true);
  });

  it('should reject protected files without source', () => {
    const intent = makeIntent({
      filePath: 'routes.json',
      content: '{}',
      commitMessage: 'update routes',
    });
    const result = checkWrite(intent);
    expect(result.passed).toBe(false);
    expect(result.missingSource).toBe(true);
    expect(result.protectedFile).toBe(true);
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it('should reject security_registry.yaml without source', () => {
    const intent = makeIntent({
      filePath: 'security_registry.yaml',
      content: 'whitelist: []',
    });
    const result = checkWrite(intent);
    expect(result.passed).toBe(false);
    expect(result.missingSource).toBe(true);
  });

  it('should detect source URL in content', () => {
    const intent = makeIntent({
      filePath: 'backends.json',
      content: 'https://github.com/example/config',
    });
    const result = checkWrite(intent);
    expect(result.passed).toBe(true);
  });
});

describe('getProtectedPatterns', () => {
  it('should return all protected patterns', () => {
    const patterns = getProtectedPatterns();
    expect(patterns.length).toBeGreaterThanOrEqual(8);
    expect(patterns).toContain('**/CRUSH.md');
    expect(patterns).toContain('**/routes.json');
  });
});

describe('getRequireSourcePatterns', () => {
  it('should return all require-source patterns', () => {
    const patterns = getRequireSourcePatterns();
    expect(patterns.length).toBeGreaterThanOrEqual(5);
    expect(patterns).toContain('**/routes.json');
    expect(patterns).toContain('**/security_registry.yaml');
  });
});
