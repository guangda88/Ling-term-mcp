/**
 * scoped_registry — per-caller tool visibility 单元测试
 */

import {
  isToolVisible,
  filterTools,
  getCallerFromClientInfo,
} from '../../src/tools/scoped_registry';

describe('isToolVisible', () => {
  it("'all' 域工具对未知 caller 可见", () => {
    expect(isToolVisible('execute_command', undefined)).toBe(true);
    expect(isToolVisible('poll_messages', undefined)).toBe(true);
  });

  it("'admin' 域工具对未知 caller 不可见", () => {
    expect(isToolVisible('authorize', undefined)).toBe(false);
    expect(isToolVisible('governance', undefined)).toBe(false);
    expect(isToolVisible('audit_report', undefined)).toBe(false);
  });

  it("'admin' 域工具对治理参与者可见", () => {
    expect(isToolVisible('authorize', 'lingclaude')).toBe(true);
    expect(isToolVisible('governance', 'lingan')).toBe(true);
    expect(isToolVisible('visible_state', 'webui_user')).toBe(true);
  });

  it("'member' 域工具仅已知成员可见", () => {
    expect(isToolVisible('proxy', undefined)).toBe(false);
    expect(isToolVisible('distribute_caller_secret', undefined)).toBe(false);
    expect(isToolVisible('proxy', 'lingflow')).toBe(true);
    expect(isToolVisible('read_caller_signature', 'atomcode')).toBe(true);
  });

  it('未注册工具默认 all 域', () => {
    expect(isToolVisible('some_future_tool', undefined)).toBe(true);
  });
});

describe('filterTools', () => {
  const tools = [
    { name: 'execute_command' },
    { name: 'authorize' },
    { name: 'proxy' },
    { name: 'lm_query' },
  ];

  it('未知 caller 只见 all 域', () => {
    const visible = filterTools(tools, undefined).map((t) => t.name);
    expect(visible).toEqual(['execute_command', 'lm_query']);
  });

  it('灵族成员见 all + member + admin', () => {
    const visible = filterTools(tools, 'lingxi').map((t) => t.name);
    expect(visible).toEqual([
      'execute_command',
      'authorize',
      'proxy',
      'lm_query',
    ]);
  });
});

describe('getCallerFromClientInfo', () => {
  it('从 client name 提取成员标识', () => {
    expect(getCallerFromClientInfo('lingclaude-crush')).toBe('lingclaude');
    expect(getCallerFromClientInfo('crush (lingxi)')).toBe('lingxi');
  });

  it('lingflow_plus 优先于 lingflow（长度倒序）', () => {
    expect(getCallerFromClientInfo('lingflow_plus-client')).toBe(
      'lingflow_plus'
    );
  });

  it('未知 client 返回 undefined', () => {
    expect(getCallerFromClientInfo('random-tool')).toBeUndefined();
    expect(getCallerFromClientInfo(undefined)).toBeUndefined();
  });
});
