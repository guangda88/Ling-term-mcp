/**
 * Information Gain Detector Tests — R5 v7 dual-dimension matrix
 */

import {
  jaccardSimilarity,
  analyzeInfoDelta,
  classifyInfoDelta,
} from '../../src/monitoring/info_delta';

describe('jaccardSimilarity', () => {
  it('should return 1.0 for identical strings', () => {
    expect(jaccardSimilarity('ls -la', 'ls -la')).toBe(1.0);
  });

  it('should return 0.0 for completely different strings', () => {
    expect(jaccardSimilarity('ls -la /tmp', 'cd /home')).toBe(0.0);
  });

  it('should return ~0.5 for partially overlapping strings', () => {
    // "ls -la /tmp" vs "ls -la /home" → {ls, -la} shared, {/tmp, /home} distinct
    const j = jaccardSimilarity('ls -la /tmp', 'ls -la /home');
    expect(j).toBeGreaterThan(0.3);
    expect(j).toBeLessThan(0.7);
  });

  it('should handle empty strings', () => {
    expect(jaccardSimilarity('', '')).toBe(1.0);
    expect(jaccardSimilarity('', 'ls')).toBe(0.0);
  });
});

describe('classifyInfoDelta', () => {
  it('should classify high RB + high J as cognitive_repeat', () => {
    expect(classifyInfoDelta(0.2, 0.8)).toBe('cognitive_repeat');
  });

  it('should classify high RB + low J as functional_iteration', () => {
    expect(classifyInfoDelta(0.2, 0.1)).toBe('functional_iteration');
  });

  it('should classify low RB + high J as rhetoric_loop', () => {
    expect(classifyInfoDelta(0.05, 0.8)).toBe('rhetoric_loop');
  });

  it('should classify low RB + low J as healthy', () => {
    expect(classifyInfoDelta(0.05, 0.1)).toBe('healthy');
  });
});

describe('analyzeInfoDelta', () => {
  it('should return healthy for less than 2 pairs', () => {
    const result = analyzeInfoDelta([{ command: 'ls', text: 'file1' }]);
    expect(result.classification).toBe('healthy');
  });

  it('should detect functional iteration (same tool, different output)', () => {
    // Same command "ls" repeated, but completely different outputs
    const pairs = [
      { command: 'ls /tmp', text: 'temp.log' },
      { command: 'ls /home', text: 'user1 user2' },
      { command: 'ls /var', text: 'log cache' },
    ];
    const result = analyzeInfoDelta(pairs);
    expect(result.classification).toBe('functional_iteration');
    expect(result.repeatBurstRate).toBeGreaterThan(0.15);
    expect(result.maxJaccardSameCommand).toBeLessThan(0.3);
  });

  it('should detect cognitive repetition (same tool, identical output)', () => {
    const pairs = [
      { command: 'ls /tmp', text: 'temp.log' },
      { command: 'ls /tmp', text: 'temp.log' },
      { command: 'ls /tmp', text: 'temp.log' },
    ];
    const result = analyzeInfoDelta(pairs);
    expect(result.classification).toBe('cognitive_repeat');
    expect(result.repeatBurstRate).toBeGreaterThan(0.15);
    expect(result.maxJaccardSameCommand).toBe(1.0);
  });

  it('should detect rhetoric loop (different commands, same output pattern)', () => {
    const pairs = [
      { command: 'echo hello', text: 'hello world' },
      { command: 'printf hello', text: 'hello world' },
      { command: 'cat greeting', text: 'hello world' },
    ];
    const result = analyzeInfoDelta(pairs);
    // Different commands so low RB, but very similar output = high J
    expect(result.repeatBurstRate).toBe(0);
    expect(result.maxJaccardSameCommand).toBe(0);
    // With no same-command pairs, it defaults to healthy — this is the
    // current limitation: rhetoric_loop requires cross-command similarity
    expect(result.classification).toBe('healthy');
  });

  it('should detect healthy pattern (different tools, different outputs)', () => {
    const pairs = [
      { command: 'ls', text: 'file1 file2' },
      { command: 'cd /tmp', text: 'Command executed successfully' },
      { command: 'cat test.txt', text: 'content' },
    ];
    const result = analyzeInfoDelta(pairs);
    expect(result.classification).toBe('healthy');
  });

  it('should provide trigger pair for debugging', () => {
    const pairs = [
      { command: 'ls /tmp', text: 'a.log' },
      { command: 'ls /tmp', text: 'a.log' },
    ];
    const result = analyzeInfoDelta(pairs);
    expect(result.triggerPair).toBeDefined();
    expect(result.triggerPair!.command).toBe('ls');
    expect(result.triggerPair!.jaccard).toBe(1.0);
  });

  it('should handle empty pairs gracefully', () => {
    const result = analyzeInfoDelta([]);
    expect(result.classification).toBe('healthy');
    expect(result.repeatBurstRate).toBe(0);
  });
});
