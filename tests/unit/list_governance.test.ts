import { governance } from '../../src/tools/list_governance';
import {
  createProposal,
  resolveProposal,
  listProposals,
  getImmutableBlacklist,
  snapshotLists,
  _resetForTesting,
} from '../../src/security/list_governance';
import {
  DEFAULT_BLACKLIST,
  DEFAULT_WHITELIST,
  RED_ZONE_COMMANDS,
  applyListChange,
} from '../../src/security/validator';

type ToolResult = { content: Array<{ text: string }>; isError?: boolean };

beforeEach(() => {
  _resetForTesting();
});

describe('list_governance — createProposal', () => {
  it('should create a pending proposal', () => {
    const result = createProposal(
      'lingxi',
      'whitelist',
      'add',
      ['mycmd'],
      'Adding mycmd for build tool support'
    );
    expect(result.error).toBeUndefined();
    expect(result.proposal).toBeDefined();
    expect(result.proposal!.status).toBe('pending');
    expect(result.proposal!.proposer).toBe('lingxi');
    expect(result.proposal!.entries).toEqual(['mycmd']);
  });

  it('should reject unknown proposer', () => {
    const result = createProposal(
      'stranger',
      'whitelist',
      'add',
      ['cmd'],
      'some reason here'
    );
    expect(result.error).toContain('not a registered');
  });

  it('should reject empty entries', () => {
    const result = createProposal(
      'lingxi',
      'whitelist',
      'add',
      [],
      'some reason here'
    );
    expect(result.error).toContain('cannot be empty');
  });

  it('should reject entries with shell metacharacters', () => {
    const result = createProposal(
      'lingxi',
      'whitelist',
      'add',
      ['cmd;rm'],
      'some reason here'
    );
    expect(result.error).toContain('metacharacters');
  });

  it('should reject short reason', () => {
    const result = createProposal(
      'lingxi',
      'whitelist',
      'add',
      ['cmd'],
      'short'
    );
    expect(result.error).toContain('at least 10 characters');
  });

  it('should reject removal of immutable blacklist entries', () => {
    const result = createProposal(
      'lingxi',
      'blacklist',
      'remove',
      ['rm'],
      'Trying to unblock rm command'
    );
    expect(result.error).toContain('immutable');
    expect(result.error).toContain('rm');
  });

  it('should reject too many entries', () => {
    const entries = Array.from({ length: 25 }, (_, i) => `cmd${i}`);
    const result = createProposal(
      'lingxi',
      'whitelist',
      'add',
      entries,
      'Adding many commands at once'
    );
    expect(result.error).toContain('more than 20');
  });
});

describe('list_governance — resolveProposal (dual-sign)', () => {
  it('should apply change when a different member approves', () => {
    const { proposal } = createProposal(
      'lingxi',
      'whitelist',
      'add',
      ['newtool'],
      'Adding newtool for development'
    );
    expect(proposal!.status).toBe('pending');

    const result = resolveProposal(proposal!.id, 'lingclaude', 'approve');
    expect(result.error).toBeUndefined();
    expect(result.proposal!.status).toBe('applied');
    expect(result.proposal!.approved_by).toBe('lingclaude');
    expect(DEFAULT_WHITELIST).toContain('newtool');
  });

  it('should reject self-approval (dual-sign rule)', () => {
    const { proposal } = createProposal(
      'lingxi',
      'whitelist',
      'add',
      ['solocmd'],
      'Adding solocmd for testing'
    );

    const result = resolveProposal(proposal!.id, 'lingxi', 'approve');
    expect(result.error).toContain('Dual-sign');
    expect(result.error).toContain('cannot approve');
  });

  it('should reject proposal from unknown approver', () => {
    const { proposal } = createProposal(
      'lingxi',
      'whitelist',
      'add',
      ['cmd'],
      'Adding cmd for testing'
    );

    const result = resolveProposal(proposal!.id, 'hacker', 'approve');
    expect(result.error).toContain('not a registered');
  });

  it('should reject already resolved proposal', () => {
    const { proposal } = createProposal(
      'lingxi',
      'whitelist',
      'add',
      ['cmd1'],
      'Adding cmd1 for testing'
    );
    resolveProposal(proposal!.id, 'lingclaude', 'approve');

    const result = resolveProposal(proposal!.id, 'lingflow', 'approve');
    expect(result.error).toContain('already applied');
  });

  it('should reject non-existent proposal', () => {
    const result = resolveProposal('nonexistent-id', 'lingclaude', 'approve');
    expect(result.error).toContain('not found');
  });

  it('should handle rejection without applying changes', () => {
    const { proposal } = createProposal(
      'lingxi',
      'whitelist',
      'add',
      ['rejectedcmd'],
      'Adding rejectedcmd for testing'
    );

    const result = resolveProposal(
      proposal!.id,
      'lingclaude',
      'reject',
      'Not needed'
    );
    expect(result.proposal!.status).toBe('rejected');
    expect(result.proposal!.rejected_by).toBe('lingclaude');
    expect(DEFAULT_WHITELIST).not.toContain('rejectedcmd');
  });

  it('should actually remove entries from blacklist (non-immutable)', () => {
    // 'at' is in the blacklist but not immutable
    expect(DEFAULT_BLACKLIST).toContain('at');
    const { proposal } = createProposal(
      'lingxi',
      'blacklist',
      'remove',
      ['at'],
      'Removing at from blacklist'
    );

    const result = resolveProposal(proposal!.id, 'lingclaude', 'approve');
    expect(result.proposal!.status).toBe('applied');
    expect(DEFAULT_BLACKLIST).not.toContain('at');
    // restore for other tests
    DEFAULT_BLACKLIST.push('at');
  });

  it('should add entries to red_zone', () => {
    const { proposal } = createProposal(
      'lingxi',
      'red_zone',
      'add',
      ['customcmd'],
      'Adding customcmd to red_zone'
    );

    const result = resolveProposal(proposal!.id, 'lingclaude', 'approve');
    expect(result.proposal!.status).toBe('applied');
    expect(RED_ZONE_COMMANDS).toContain('customcmd');
    // cleanup
    const idx = RED_ZONE_COMMANDS.indexOf('customcmd');
    if (idx !== -1) RED_ZONE_COMMANDS.splice(idx, 1);
  });
});

describe('list_governance — listProposals', () => {
  it('should list proposals with filters', () => {
    createProposal('lingxi', 'whitelist', 'add', ['a'], 'reason a here');
    const { proposal: p2 } = createProposal(
      'lingflow',
      'blacklist',
      'add',
      ['b'],
      'reason b here'
    );
    resolveProposal(p2!.id, 'lingclaude', 'approve');

    const pending = listProposals({ status: 'pending' });
    expect(pending.length).toBe(1);
    expect(pending[0].proposer).toBe('lingxi');

    const applied = listProposals({ status: 'applied' });
    expect(applied.length).toBe(1);

    const byFlow = listProposals({ proposer: 'lingflow' });
    expect(byFlow.length).toBe(1);
  });
});

describe('list_governance — immutable blacklist', () => {
  it('should include core dangerous commands', () => {
    const immutable = getImmutableBlacklist();
    expect(immutable).toContain('rm');
    expect(immutable).toContain('sudo');
    expect(immutable).toContain('dd');
    expect(immutable).toContain('iptables');
  });
});

describe('list_governance — snapshotLists', () => {
  it('should return current effective lists', () => {
    const snap = snapshotLists();
    expect(snap.whitelist).toContain('ls');
    expect(snap.blacklist).toContain('rm');
    expect(snap.red_zone).toContain('ssh');
  });
});

// === MCP tool layer tests ===

describe('governance propose (MCP tool)', () => {
  it('should create proposal via MCP handler', async () => {
    const result = (await governance.handler({
      command: 'propose',
      proposer: 'lingxi',
      list_type: 'whitelist',
      action: 'add',
      entries: ['mcpcmd'],
      reason: 'Testing MCP tool layer',
    })) as ToolResult;
    expect(result.isError).toBeUndefined();
    const body = JSON.parse(
      (result.content as Array<{ text: string }>)[0].text
    );
    expect(body.status).toBe('pending');
    expect(body.entries).toEqual(['mcpcmd']);
  });

  it('should reject unknown proposer via MCP handler', async () => {
    const result = (await governance.handler({
      command: 'propose',
      proposer: 'hacker',
      list_type: 'whitelist',
      action: 'add',
      entries: ['cmd'],
      reason: 'some reason here',
    })) as ToolResult;
    expect(result.isError).toBe(true);
  });
});

describe('governance review (MCP tool)', () => {
  it('should approve and apply via MCP handler', async () => {
    const proposeResult = (await governance.handler({
      command: 'propose',
      proposer: 'lingxi',
      list_type: 'whitelist',
      action: 'add',
      entries: ['approveme'],
      reason: 'Testing approve flow',
    })) as ToolResult;
    const { id } = JSON.parse(proposeResult.content[0].text);

    const reviewResult = (await governance.handler({
      command: 'review',
      proposal_id: id,
      reviewer: 'lingclaude',
      decision: 'approve',
    })) as ToolResult;
    expect(reviewResult.isError).toBeUndefined();
    const body = JSON.parse(
      (reviewResult.content as Array<{ text: string }>)[0].text
    );
    expect(body.proposal.status).toBe('applied');
    expect(DEFAULT_WHITELIST).toContain('approveme');
    // cleanup
    const idx = DEFAULT_WHITELIST.indexOf('approveme');
    if (idx !== -1) DEFAULT_WHITELIST.splice(idx, 1);
  });

  it('should block self-approval via MCP handler', async () => {
    const proposeResult = (await governance.handler({
      command: 'propose',
      proposer: 'lingxi',
      list_type: 'whitelist',
      action: 'add',
      entries: ['selfapprove'],
      reason: 'Testing self-approve block',
    })) as ToolResult;
    const { id } = JSON.parse(proposeResult.content[0].text);

    const result = (await governance.handler({
      command: 'review',
      proposal_id: id,
      reviewer: 'lingxi',
      decision: 'approve',
    })) as ToolResult;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Dual-sign');
  });
});

describe('governance list (MCP tool)', () => {
  it('should list proposals and show current lists', async () => {
    await governance.handler({
      command: 'propose',
      proposer: 'lingxi',
      list_type: 'whitelist',
      action: 'add',
      entries: ['listcmd'],
      reason: 'Testing list tool',
    });

    const result = (await governance.handler({
      command: 'list',
    })) as ToolResult;
    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text);
    expect(body.total).toBe(1);
    expect(body.immutable_blacklist).toBeDefined();
    expect(body.current_lists).toBeDefined();
    expect(body.current_lists.whitelist).toContain('ls');
  });
});

describe('applyListChange (direct)', () => {
  it('should add and remove entries directly', () => {
    applyListChange('whitelist', 'add', ['directadd']);
    expect(DEFAULT_WHITELIST).toContain('directadd');

    applyListChange('whitelist', 'remove', ['directadd']);
    expect(DEFAULT_WHITELIST).not.toContain('directadd');
  });

  it('should be idempotent on duplicate add', () => {
    applyListChange('whitelist', 'add', ['ls']);
    const count = DEFAULT_WHITELIST.filter((c) => c === 'ls').length;
    expect(count).toBe(1);
  });

  it('should be safe on remove non-existent', () => {
    applyListChange('whitelist', 'remove', ['nonexistent']);
    // should not throw
  });
});
