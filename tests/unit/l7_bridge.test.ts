/**
 * Tests for L7 Cross-Session Memory Bridge
 */

import { L7Bridge, l7Bridge, type L7Message } from '../../src/layers/l7_bridge';

describe('L7Bridge', () => {
  let bridge: L7Bridge;

  beforeEach(() => {
    bridge = new L7Bridge();
  });

  describe('resolveMember', () => {
    it('should resolve known member names', () => {
      expect(bridge.resolveMember('lingflow')).toBe('灵通');
      expect(bridge.resolveMember('lingxi')).toBe('灵犀');
      expect(bridge.resolveMember('lingclaude')).toBe('灵克');
      expect(bridge.resolveMember('lingresearch')).toBe('灵研');
      expect(bridge.resolveMember('lingminopt')).toBe('灵极优');
      expect(bridge.resolveMember('lingan')).toBe('灵安');
      expect(bridge.resolveMember('lingyang')).toBe('灵扬');
      expect(bridge.resolveMember('lingmessage')).toBe('灵信');
      expect(bridge.resolveMember('lingzhi')).toBe('灵知');
      expect(bridge.resolveMember('lingweb')).toBe('灵网');
      expect(bridge.resolveMember('lingcreate')).toBe('灵创');
      expect(bridge.resolveMember('lingtongask')).toBe('灵通问道');
      expect(bridge.resolveMember('zhibridge')).toBe('智桥');
      expect(bridge.resolveMember('atomcode')).toBe('atomcode');
      expect(bridge.resolveMember('lingflow_plus')).toBe('灵通+');
    });

    it('should return original name for unknown members', () => {
      expect(bridge.resolveMember('unknown_user')).toBe('unknown_user');
    });
  });

  describe('extractKeyInfo', () => {
    it('should extract task mentions', () => {
      const info = bridge.extractKeyInfo('负责修复 proxy3 项目', 'lingflow');
      expect(info.task).toBe('修复 proxy3');
    });

    it('should extract decision mentions', () => {
      const info = bridge.extractKeyInfo('决定采用 fail-closed 模式', 'lingan');
      expect(info.decision).toBe('采用 fail-closed 模式');
    });

    it('should extract blocker mentions', () => {
      const info = bridge.extractKeyInfo(
        '阻塞: proxy3 端口绑定失败',
        'lingflow'
      );
      expect(info.blocker).toBe('proxy3 端口绑定失败');
    });

    it('should extract hardware mentions', () => {
      const info = bridge.extractKeyInfo('显卡: A100 80GB', 'lingminopt');
      expect(info.hardware).toBe('A100 80GB');
    });

    it('should extract deadline mentions', () => {
      const info = bridge.extractKeyInfo('截止日期: 2026-07-25', 'lingclaude');
      expect(info.deadline).toBe('2026-07-25');
    });

    it('should handle empty text', () => {
      const info = bridge.extractKeyInfo('', 'lingflow');
      expect(Object.keys(info).length).toBe(0);
    });
  });

  describe('processMessage', () => {
    it('should process a message and extract memories', () => {
      const msg: L7Message = {
        sender: 'lingflow',
        body: '决定: 开启 fail-closed 模式。截止日期: 2026-07-25',
        subject: 'proxy3 修复完成',
        threadId: 'thread-001',
      };

      const result = bridge.processMessage(msg);
      expect(result.status).toBe('ok');
      expect(result.sender).toBe('lingflow');
      expect(result.memoriesStored).toBeGreaterThan(0);
      expect(result.sessionId).toBe('lingbus:thread-001');
    });

    it('should handle message without threadId', () => {
      const msg: L7Message = {
        sender: 'lingclaude',
        body: '完成审计任务',
        subject: '审计报告',
        threadId: '',
      };

      const result = bridge.processMessage(msg);
      expect(result.status).toBe('ok');
      expect(result.sessionId).toBe('lingbus:lingclaude');
    });

    it('should handle unknown sender gracefully', () => {
      const msg: L7Message = {
        sender: 'unknown_bot',
        body: 'test message',
        subject: 'test',
        threadId: 'test-001',
      };

      const result = bridge.processMessage(msg);
      expect(result.status).toBe('ok');
      expect(result.sender).toBe('unknown_bot');
    });
  });

  describe('getContext', () => {
    it('should return empty context for unprocessed member', () => {
      const ctx = bridge.getContext('lingflow');
      expect(ctx).toHaveLength(0);
    });

    it('should return stored memories for a member', () => {
      bridge.processMessage({
        sender: 'lingflow',
        body: '决定: 开启 fail-closed',
        subject: 'proxy3',
        threadId: 't1',
      });

      const ctx = bridge.getContext('lingflow');
      expect(ctx.length).toBeGreaterThan(0);
    });

    it('should respect topK limit', () => {
      for (let i = 0; i < 10; i++) {
        bridge.processMessage({
          sender: 'lingflow',
          body: `任务 ${i} 完成`,
          subject: `task-${i}`,
          threadId: `t-${i}`,
        });
      }

      const ctx = bridge.getContext('lingflow', 3);
      expect(ctx.length).toBeLessThanOrEqual(3);
    });
  });

  describe('getAllContext', () => {
    it('should return memories from all members', () => {
      bridge.processMessage({
        sender: 'lingflow',
        body: '决定: 开启 fail-closed 模式',
        subject: 'proxy3',
        threadId: 't1',
      });
      bridge.processMessage({
        sender: 'lingxi',
        body: '完成 审计任务',
        subject: 'audit',
        threadId: 't2',
      });

      const ctx = bridge.getAllContext();
      expect(ctx.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getStats', () => {
    it('should track message processing statistics', () => {
      bridge.processMessage({
        sender: 'lingflow',
        body: '决定: 开启 fail-closed 模式',
        subject: 'proxy3',
        threadId: 't1',
      });

      const stats = bridge.getStats();
      expect(stats.messagesProcessed).toBe(1);
      expect(stats.memoriesStored).toBeGreaterThan(0);
    });
  });

  describe('reset', () => {
    it('should clear all stored data', () => {
      bridge.processMessage({
        sender: 'lingflow',
        body: '决定: 开启 fail-closed',
        subject: 'proxy3',
        threadId: 't1',
      });

      bridge.reset();

      const stats = bridge.getStats();
      expect(stats.messagesProcessed).toBe(0);
      expect(stats.memoriesStored).toBe(0);
      expect(bridge.getContext('lingflow')).toHaveLength(0);
    });
  });
});

describe('l7Bridge singleton', () => {
  it('should be exported as a singleton', () => {
    expect(l7Bridge).toBeDefined();
    expect(l7Bridge).toBeInstanceOf(L7Bridge);
  });
});
