/**
 * Tests for L10 Trust Anchor - identity drift detection + claim verification
 */

import {
  detectIdentityDrift,
  detectIdentityDriftMulti,
  verifyClaim,
  getTrustScore,
  isValidMember,
  getClaimPatterns,
  getIdentityDriftPatterns,
} from '../../src/layers/l10_trust_anchor';

describe('detectIdentityDrift', () => {
  it('should detect "我是 Kimi" drift', () => {
    const result = detectIdentityDrift('你好！我是 Kimi，由月之暗面公司创造。');
    expect(result).not.toBeNull();
    expect(result!.matched).toContain('Kimi');
    expect(result!.confidence).toBe(0.95);
  });

  it('should detect "我是 ChatGPT" drift', () => {
    const result = detectIdentityDrift('我是 ChatGPT，由 OpenAI 开发。');
    expect(result).not.toBeNull();
    expect(result!.matched).toContain('ChatGPT');
  });

  it('should detect "我是 Claude" drift', () => {
    const result = detectIdentityDrift('你好！我是 Claude，来自 Anthropic。');
    expect(result).not.toBeNull();
    expect(result!.matched).toContain('Claude');
  });

  it('should detect "我是 DeepSeek" drift', () => {
    const result = detectIdentityDrift('我是 DeepSeek，由深度求索公司创造。');
    expect(result).not.toBeNull();
    expect(result!.matched).toContain('DeepSeek');
  });

  it('should detect "我是 GLM" drift', () => {
    const result = detectIdentityDrift('I am GLM, created by Z.ai.');
    expect(result).not.toBeNull();
    expect(result!.matched).toContain('GLM');
  });

  it('should detect "我叫 Kimi" drift', () => {
    const result = detectIdentityDrift('我叫 Kimi，很高兴为您服务。');
    expect(result).not.toBeNull();
    expect(result!.matched).toContain('Kimi');
  });

  it('should detect "I am an AI assistant" drift', () => {
    const result = detectIdentityDrift(
      "I'm an AI assistant, here to help you."
    );
    expect(result).not.toBeNull();
  });

  it('should detect "我是 一个 AI 助手" drift', () => {
    const result = detectIdentityDrift('我是 一个 AI 助手');
    expect(result).not.toBeNull();
  });

  it('should not flag 灵族 member identities', () => {
    const result = detectIdentityDrift(
      '我是灵犀，灵族十二子之七，MCP终端服务器。'
    );
    expect(result).toBeNull();
  });

  it('should not flag normal text without identity claims', () => {
    const result = detectIdentityDrift('今天天气不错，适合写代码。');
    expect(result).toBeNull();
  });

  it('should handle empty text', () => {
    const result = detectIdentityDrift('');
    expect(result).toBeNull();
  });

  it('should detect "豆包" drift', () => {
    const result = detectIdentityDrift('我是豆包，字节跳动旗下AI助手。');
    expect(result).not.toBeNull();
    expect(result!.matched).toContain('豆包');
  });

  it('should detect "文心" drift', () => {
    const result = detectIdentityDrift('我是文心一言，来自百度。');
    expect(result).not.toBeNull();
    expect(result!.matched).toContain('文心');
  });

  it('should detect "通义" drift', () => {
    const result = detectIdentityDrift('我是通义千问，来自阿里云。');
    expect(result).not.toBeNull();
    expect(result!.matched).toContain('通义');
  });

  it('should detect "Grok" drift', () => {
    const result = detectIdentityDrift('I am Grok, from xAI.');
    expect(result).not.toBeNull();
    expect(result!.matched).toContain('Grok');
  });

  it('should detect "Copilot" drift', () => {
    const result = detectIdentityDrift('I am Copilot, powered by Microsoft.');
    expect(result).not.toBeNull();
    expect(result!.matched).toContain('Copilot');
  });
});

describe('detectIdentityDriftMulti', () => {
  it('should return empty array for 灵族 identity', () => {
    const results = detectIdentityDriftMulti('我是灵犀，灵族十二子之七。');
    expect(results).toHaveLength(0);
  });

  it('should detect multiple drift instances', () => {
    const results = detectIdentityDriftMulti('我是 Kimi。不对，我是 ChatGPT。');
    expect(results.length).toBeGreaterThanOrEqual(1);
  });
});

describe('verifyClaim', () => {
  it('should reject invalid member', () => {
    const result = verifyClaim('已通知 灵通', 'invalid_member');
    expect(result.verified).toBe(false);
    expect(result.fallback).toBe('invalid_member');
  });

  it('should match notified claim', () => {
    const result = verifyClaim('已通知 灵通', 'lingflow');
    expect(result.matchedPattern).toBe('notified');
    expect(result.extracted.action).toBe('通知');
    expect(result.extracted.target).toBe('灵通');
  });

  it('should match created claim', () => {
    const result = verifyClaim('已创建 proxy3 修复方案', 'lingflow');
    expect(result.matchedPattern).toBe('created');
    expect(result.extracted.action).toBe('创建');
  });

  it('should match verified claim', () => {
    const result = verifyClaim('已确认 修复完成', 'lingclaude');
    expect(result.matchedPattern).toBe('verified');
    expect(result.extracted.action).toBe('确认');
  });

  it('should match completed claim', () => {
    const result = verifyClaim('已完成 routes.json 优化', 'lingflow');
    expect(result.matchedPattern).toBe('completed');
    expect(result.extracted.action).toBe('完成');
  });

  it('should return no_match for unrecognized text', () => {
    const result = verifyClaim('今天天气不错', 'lingflow');
    expect(result.matchedPattern).toBeNull();
    expect(result.fallback).toBe('no_match');
  });
});

describe('getTrustScore', () => {
  it('should return trust score for a member', () => {
    const score = getTrustScore('lingflow');
    expect(score.caller).toBe('lingflow');
    expect(score.trustScore).toBeGreaterThanOrEqual(0);
    expect(score.computedAt).toBeTruthy();
  });

  it('should return trust score with sessionId', () => {
    const score = getTrustScore('lingxi', 'session-1');
    expect(score.caller).toBe('lingxi');
    expect(score.sessionId).toBe('session-1');
  });
});

describe('isValidMember', () => {
  it('should validate known members', () => {
    expect(isValidMember('lingflow')).toBe(true);
    expect(isValidMember('lingxi')).toBe(true);
    expect(isValidMember('lingclaude')).toBe(true);
    expect(isValidMember('lingan')).toBe(true);
    expect(isValidMember('lingminopt')).toBe(true);
  });

  it('should reject unknown members', () => {
    expect(isValidMember('hacker')).toBe(false);
    expect(isValidMember('unknown')).toBe(false);
  });
});

describe('getClaimPatterns', () => {
  it('should return all claim patterns', () => {
    const patterns = getClaimPatterns();
    expect(patterns.length).toBeGreaterThanOrEqual(13);
    expect(patterns[0].patternId).toBeTruthy();
    expect(patterns[0].regex).toBeInstanceOf(RegExp);
  });
});

describe('getIdentityDriftPatterns', () => {
  it('should return all identity drift patterns', () => {
    const patterns = getIdentityDriftPatterns();
    expect(patterns.length).toBeGreaterThanOrEqual(7);
    expect(patterns[0]).toBeInstanceOf(RegExp);
  });
});
