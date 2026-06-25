/**
 * Visible State Tool Tests — security visibility (7th dimension)
 */

import { visibleState } from '../../src/tools/visible_state';
import { getSecurityVisibility } from '../../src/audit/rejection_log';

describe('visible_state tool', () => {
  it('should have correct definition', () => {
    expect(visibleState.definition.name).toBe('visible_state');
    expect(visibleState.definition.description).toContain('security');
  });

  it('should return summary format by default', async () => {
    const result = await visibleState.handler({});
    expect(result.content).toHaveLength(1);
    const text = (result.content[0] as { text: string }).text;
    const data = JSON.parse(text);
    expect(data.dimension).toBe('security');
    expect(data.member).toBe('lingxi');
    expect(data).toHaveProperty('today_rejections');
    expect(data).toHaveProperty('redzone_intercept_rate');
    expect(data.redzone_intercept_rate).toBe(100);
    expect(data).toHaveProperty('by_category');
  });

  it('should return detailed format with list counts', async () => {
    const result = await visibleState.handler({ format: 'detailed' });
    const text = (result.content[0] as { text: string }).text;
    const data = JSON.parse(text);
    expect(data.metrics).toBeDefined();
    expect(data.lists).toBeDefined();
    expect(data.lists.authorizable_commands).toContain('rm');
    expect(data.lists.authorizable_commands).toContain('kill');
    expect(data.lists.authorizable_count).toBe(7);
    expect(data.lists.blacklist_count).toBeGreaterThan(0);
    expect(data.lists.whitelist_count).toBeGreaterThan(0);
  });
});

describe('getSecurityVisibility', () => {
  it('should return numeric metrics', () => {
    const result = getSecurityVisibility();
    expect(typeof result.today_rejections).toBe('number');
    expect(result.redzone_intercept_rate).toBe(100);
    expect(result.by_category).toBeDefined();
    expect(Array.isArray(result.top_blocked_callers)).toBe(true);
  });
});
