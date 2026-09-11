/**
 * Phase B — DiscussionResponder 骨架测试
 * RFC v0.2 §Phase B / B-1
 */

import {
  PollManager,
  ThreadFilter,
  ResponderSelect,
  VALID_MEMBERS,
  ReplyDispatcher,
} from '../../src/discussion/index.js';
import type { Message } from '../../src/discussion/types.js';

describe('ResponderSelect', () => {
  const select = new ResponderSelect();

  it('excludes own identity from selection', () => {
    // 最后发言者是 lingclaude，参与者有 lingclaude + lingflow + lingxi
    // lingxi 是自己，应被排除；lingclaude 是最后发言者，也应被排除
    // 剩下 lingflow 作为响应者
    const msgs: Message[] = [
      {
        rowid: 1,
        thread_id: 't1',
        sender: 'lingclaude',
        body: 'hi',
        channel: 'ecosystem',
        timestamp: new Date().toISOString(),
      },
    ];
    const result = select.selectResponder(
      msgs,
      ['lingclaude', 'lingflow', 'lingxi'],
      'lingxi'
    );
    expect(result).toBe('lingflow');
  });

  it('excludes last sender', () => {
    const msgs: Message[] = [
      {
        rowid: 1,
        thread_id: 't1',
        sender: 'lingclaude',
        body: 'hi',
        channel: 'ecosystem',
        timestamp: new Date().toISOString(),
      },
    ];
    const result = select.selectResponder(
      msgs,
      ['lingclaude', 'lingflow'],
      'lingxi'
    );
    // 轮转：从 lingclaude 下一位开始 → lingflow
    expect(result).toBe('lingflow');
  });

  it('filters out non-whitelisted members', () => {
    const msgs: Message[] = [
      {
        rowid: 1,
        thread_id: 't1',
        sender: 'zhibridge',
        body: 'hi',
        channel: 'ecosystem',
        timestamp: new Date().toISOString(),
      },
    ];
    // zhibridge 不在白名单
    const result = select.selectResponder(
      msgs,
      ['zhibridge', 'lingflow'],
      'lingxi'
    );
    expect(result).toBe('lingflow');
  });

  it('returns null when no valid responder', () => {
    const msgs: Message[] = [
      {
        rowid: 1,
        thread_id: 't1',
        sender: 'lingxi',
        body: 'hi',
        channel: 'ecosystem',
        timestamp: new Date().toISOString(),
      },
    ];
    const result = select.selectResponder(msgs, ['lingxi'], 'lingxi');
    expect(result).toBeNull();
  });

  it('VALID_MEMBERS contains expected members', () => {
    expect(VALID_MEMBERS.has('lingxi')).toBe(true);
    expect(VALID_MEMBERS.has('lingflow')).toBe(true);
    expect(VALID_MEMBERS.has('lingclaude')).toBe(true);
    expect(VALID_MEMBERS.has('zhibridge')).toBe(false);
    expect(VALID_MEMBERS.has('lingyi')).toBe(false);
  });
});

describe('ThreadFilter', () => {
  const filter = new ThreadFilter({
    minReplyIntervalSec: 300,
    ownIdentity: 'lingxi',
    channels: ['governance', 'ecosystem'],
  });

  it('allows response in allowed channel', () => {
    const msg: Message = {
      rowid: 1,
      thread_id: 't1',
      sender: 'lingflow',
      body: 'hello',
      channel: 'ecosystem',
      timestamp: new Date().toISOString(),
    };
    expect(filter.shouldRespond('t1', msg)).toBe(true);
  });

  it('skips alert channel', () => {
    const msg: Message = {
      rowid: 1,
      thread_id: 't1',
      sender: 'lingflow',
      body: 'alert',
      channel: 'alert',
      timestamp: new Date().toISOString(),
    };
    expect(filter.shouldRespond('t1', msg)).toBe(false);
  });

  it('skips own message', () => {
    const msg: Message = {
      rowid: 1,
      thread_id: 't1',
      sender: 'lingxi',
      body: 'me',
      channel: 'ecosystem',
      timestamp: new Date().toISOString(),
    };
    expect(filter.shouldRespond('t1', msg)).toBe(false);
  });

  it('enforces reply interval', () => {
    filter.recordReply('t1');
    const msg: Message = {
      rowid: 2,
      thread_id: 't1',
      sender: 'lingflow',
      body: 'again',
      channel: 'ecosystem',
      timestamp: new Date().toISOString(),
    };
    // 距离上次回复 < 300s → 跳过
    expect(filter.shouldRespond('t1', msg)).toBe(false);
  });
});

describe('PollManager', () => {
  it('starts with rowid 0', () => {
    const pm = new PollManager({
      channels: ['ecosystem'],
      intervalMs: 60_000,
      batchLimit: 100,
      statePath: '/tmp/test-poll-state.json',
    });
    expect(pm.lastRowidValue).toBe(0);
  });

  it('advances rowid on new messages', async () => {
    const pm = new PollManager({
      channels: ['ecosystem'],
      intervalMs: 60_000,
      batchLimit: 100,
      statePath: '/tmp/test-poll-state2.json',
    });
    const msgs: Message[] = [
      {
        rowid: 10,
        thread_id: 't1',
        sender: 'lingflow',
        body: 'a',
        channel: 'ecosystem',
        timestamp: new Date().toISOString(),
      },
      {
        rowid: 20,
        thread_id: 't1',
        sender: 'lingclaude',
        body: 'b',
        channel: 'ecosystem',
        timestamp: new Date().toISOString(),
      },
    ];
    const stats = await pm.scanOnce(async () => msgs);
    expect(pm.lastRowidValue).toBe(20);
    expect(stats.new_msgs).toBe(2);
  });
});

describe('ReplyDispatcher (dry_run)', () => {
  it('returns success in dry_run mode', async () => {
    const dispatcher = new ReplyDispatcher({ dryRun: true });
    const result = await dispatcher.dispatch(
      't1',
      'lingflow',
      'context',
      async () => 'reply from adapter'
    );
    expect(result.success).toBe(true);
    expect(result.source).toBe('adapter');
  });

  it('records audit on failure', async () => {
    const dispatcher = new ReplyDispatcher({ dryRun: true });
    await dispatcher.dispatch('t1', 'lingflow', 'context', async () => {
      throw new Error('adapter down');
    });
    expect(dispatcher.audit.writesCount).toBeGreaterThan(0);
  });
});
