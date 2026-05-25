/**
 * Identity Registry
 */

import {
  isKnownMember,
  getMember,
  getMemberNames,
  LING_FAMILY_MEMBERS,
} from '../../src/security/identity';

describe('identity registry', () => {
  it('should have exactly 12 members', () => {
    expect(LING_FAMILY_MEMBERS.length).toBe(12);
  });

  it('should recognize all known members', () => {
    const known = [
      'lingflow',
      'lingclaude',
      'lingresearch',
      'lingzhi',
      'lingtongask',
      'lingflow_plus',
      'lingxi',
      'lingmessage',
      'lingweb',
      'lingminopt',
      'lingyang',
      'zhibridge',
    ];
    for (const name of known) {
      expect(isKnownMember(name)).toBe(true);
    }
  });

  it('should reject unknown callers', () => {
    expect(isKnownMember('unknown')).toBe(false);
    expect(isKnownMember('')).toBe(false);
    expect(isKnownMember('crush')).toBe(false);
    expect(isKnownMember('stranger')).toBe(false);
  });

  it('should return member details for known callers', () => {
    const lingxi = getMember('lingxi');
    expect(lingxi).toBeDefined();
    expect(lingxi!.name).toBe('灵犀');
    expect(lingxi!.directory).toBe('/home/ai/lingxi');
  });

  it('should return undefined for unknown callers', () => {
    expect(getMember('unknown')).toBeUndefined();
  });

  it('getMemberNames should return all 12 english names', () => {
    const names = getMemberNames();
    expect(names.length).toBe(12);
    expect(names).toContain('lingxi');
    expect(names).toContain('lingflow');
  });
});
