import {
  authorize,
  _resetForTesting,
  checkRedZoneAuthorization,
  verifyMeetingToken,
} from '../../src/tools/authorize';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const DATA_DIR =
  process.env.XDG_DATA_HOME ||
  path.join(os.homedir(), '.local', 'share', 'ling-term-mcp');
const DATA_FILE = path.join(DATA_DIR, 'sessions.json');

beforeEach(async () => {
  _resetForTesting();
  try {
    await fs.unlink(DATA_FILE);
  } catch {
    // file may not exist
  }
});

describe('authorize require', () => {
  it('should create a pending authorization request', async () => {
    const result = await authorize.handler({
      command: 'require',
      caller: 'lingflow',
      operation: 'delete old log files',
    });
    const body = JSON.parse(
      (result.content as Array<{ text: string }>)[0].text
    );
    expect(body.status).toBe('pending');
    expect(body.caller).toBe('lingflow');
    expect(body.operation).toBe('delete old log files');
    expect(body.authorization_id).toBeTruthy();
    expect(result.isError).toBeUndefined();
  });

  it('should reject unknown caller', async () => {
    const result = await authorize.handler({
      command: 'require',
      caller: 'stranger',
      operation: 'do something',
    });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0].text).toContain(
      'not a registered'
    );
  });

  it('should reject missing caller', async () => {
    const result = await authorize.handler({
      command: 'require',
      operation: 'do something',
    });
    expect(result.isError).toBe(true);
  });

  it('should reject missing operation', async () => {
    const result = await authorize.handler({
      command: 'require',
      caller: 'lingflow',
    });
    expect(result.isError).toBe(true);
  });

  it('should accept details object', async () => {
    const result = await authorize.handler({
      command: 'require',
      caller: 'lingxi',
      operation: 'modify shared config',
      details: { target: '/etc/hosts', reason: 'dns update' },
    });
    const body = JSON.parse(
      (result.content as Array<{ text: string }>)[0].text
    );
    expect(body.status).toBe('pending');
  });
});

describe('authorize approve', () => {
  it('should approve a pending request', async () => {
    const createResult = await authorize.handler({
      command: 'require',
      caller: 'lingflow',
      operation: 'deploy to production',
    });
    const { authorization_id } = JSON.parse(
      (createResult.content as Array<{ text: string }>)[0].text
    );

    const approveResult = await authorize.handler({
      command: 'approve',
      authorization_id,
      decision: 'approve',
      resolved_by: 'lingflow_plus',
    });
    const body = JSON.parse(
      (approveResult.content as Array<{ text: string }>)[0].text
    );
    expect(body.status).toBe('approved');
    expect(body.resolved_by).toBe('lingflow_plus');
  });

  it('should reject a pending request', async () => {
    const createResult = await authorize.handler({
      command: 'require',
      caller: 'lingclaude',
      operation: 'rm -rf /tmp/test',
    });
    const { authorization_id } = JSON.parse(
      (createResult.content as Array<{ text: string }>)[0].text
    );

    const rejectResult = await authorize.handler({
      command: 'approve',
      authorization_id,
      decision: 'reject',
      resolved_by: 'user',
      reason: 'too dangerous',
    });
    const body = JSON.parse(
      (rejectResult.content as Array<{ text: string }>)[0].text
    );
    expect(body.status).toBe('rejected');
    expect(body.reason).toBe('too dangerous');
  });

  it('should reject unknown resolver', async () => {
    const createResult = await authorize.handler({
      command: 'require',
      caller: 'lingflow',
      operation: 'test op',
    });
    const { authorization_id } = JSON.parse(
      (createResult.content as Array<{ text: string }>)[0].text
    );

    const result = await authorize.handler({
      command: 'approve',
      authorization_id,
      decision: 'approve',
      resolved_by: 'hacker',
    });
    expect(result.isError).toBe(true);
  });

  it('should reject already resolved request', async () => {
    const createResult = await authorize.handler({
      command: 'require',
      caller: 'lingflow',
      operation: 'test op',
    });
    const { authorization_id } = JSON.parse(
      (createResult.content as Array<{ text: string }>)[0].text
    );

    await authorize.handler({
      command: 'approve',
      authorization_id,
      decision: 'approve',
      resolved_by: 'lingflow_plus',
    });

    const result = await authorize.handler({
      command: 'approve',
      authorization_id,
      decision: 'reject',
      resolved_by: 'lingflow_plus',
    });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0].text).toContain(
      'already approved'
    );
  });

  it('should reject non-existent request', async () => {
    const result = await authorize.handler({
      command: 'approve',
      authorization_id: 'nonexistent-id',
      decision: 'approve',
      resolved_by: 'lingflow_plus',
    });
    expect(result.isError).toBe(true);
  });
});

describe('authorize list', () => {
  it('should list all requests', async () => {
    await authorize.handler({
      command: 'require',
      caller: 'lingflow',
      operation: 'op1',
    });
    await authorize.handler({
      command: 'require',
      caller: 'lingxi',
      operation: 'op2',
    });

    const result = await authorize.handler({ command: 'list' });
    const body = JSON.parse(
      (result.content as Array<{ text: string }>)[0].text
    );
    expect(body.total).toBe(2);
  });

  it('should filter by caller', async () => {
    await authorize.handler({
      command: 'require',
      caller: 'lingflow',
      operation: 'op1',
    });
    await authorize.handler({
      command: 'require',
      caller: 'lingxi',
      operation: 'op2',
    });

    const result = await authorize.handler({
      command: 'list',
      caller: 'lingflow',
    });
    const body = JSON.parse(
      (result.content as Array<{ text: string }>)[0].text
    );
    expect(body.total).toBe(1);
    expect(body.requests[0].caller).toBe('lingflow');
  });

  it('should filter by status', async () => {
    const createResult = await authorize.handler({
      command: 'require',
      caller: 'lingflow',
      operation: 'op1',
    });
    const { authorization_id } = JSON.parse(
      (createResult.content as Array<{ text: string }>)[0].text
    );
    await authorize.handler({
      command: 'approve',
      authorization_id,
      decision: 'approve',
      resolved_by: 'lingflow_plus',
    });

    const result = await authorize.handler({
      command: 'list',
      status: 'pending',
    });
    const body = JSON.parse(
      (result.content as Array<{ text: string }>)[0].text
    );
    expect(body.total).toBe(0);
  });
});

describe('command_bind prefix matching', () => {
  async function createAndApprove(
    command_bind: string,
    caller = 'lingflow'
  ): Promise<string> {
    const createResult = await authorize.handler({
      command: 'require',
      caller,
      operation: 'test op',
      command_bind,
    });
    const { authorization_id } = JSON.parse(
      (createResult.content as Array<{ text: string }>)[0].text
    );
    await authorize.handler({
      command: 'approve',
      authorization_id,
      decision: 'approve',
      resolved_by: 'lingflow_plus',
    });
    return authorization_id;
  }

  it('should allow exact match', async () => {
    const id = await createAndApprove('npm install');
    const result = checkRedZoneAuthorization(id, 'npm install');
    expect(result.allowed).toBe(true);
  });

  it('should allow command with extra args (space prefix)', async () => {
    const id = await createAndApprove('npm install');
    const result = checkRedZoneAuthorization(id, 'npm install express');
    expect(result.allowed).toBe(true);
  });

  it('should allow command with flags (space prefix)', async () => {
    const id = await createAndApprove('npm install');
    const result = checkRedZoneAuthorization(id, 'npm install -g typescript');
    expect(result.allowed).toBe(true);
  });

  it('should allow hyphenated subcommand (dash prefix)', async () => {
    const id = await createAndApprove('npm');
    const result = checkRedZoneAuthorization(id, 'npm-run');
    expect(result.allowed).toBe(true);
  });

  it('should reject unrelated command', async () => {
    const id = await createAndApprove('npm install');
    const result = checkRedZoneAuthorization(id, 'curl https://example.com');
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('prefix match failed');
  });

  it('should reject partial word match', async () => {
    const id = await createAndApprove('npm');
    const result = checkRedZoneAuthorization(id, 'npmx install');
    expect(result.allowed).toBe(false);
  });

  it('should allow any command when no command_bind', async () => {
    const createResult = await authorize.handler({
      command: 'require',
      caller: 'lingflow',
      operation: 'test op',
    });
    const { authorization_id } = JSON.parse(
      (createResult.content as Array<{ text: string }>)[0].text
    );
    await authorize.handler({
      command: 'approve',
      authorization_id,
      decision: 'approve',
      resolved_by: 'lingflow_plus',
    });
    const result = checkRedZoneAuthorization(
      authorization_id,
      'any-command-here'
    );
    expect(result.allowed).toBe(true);
  });

  it('should store command_bind in request', async () => {
    const createResult = await authorize.handler({
      command: 'require',
      caller: 'lingflow',
      operation: 'test op',
      command_bind: 'npm install',
    });
    const { authorization_id } = JSON.parse(
      (createResult.content as Array<{ text: string }>)[0].text
    );
    const listResult = await authorize.handler({
      command: 'list',
      caller: 'lingflow',
    });
    const body = JSON.parse(
      (listResult.content as Array<{ text: string }>)[0].text
    );
    expect(body.requests[0].id).toBe(authorization_id);
  });
});

describe('persistent authorization tokens', () => {
  it('should create a persistent token with 30-day expiry and max_usage', async () => {
    const result = await authorize.handler({
      command: 'require',
      caller: 'lingclaude',
      operation: 'SSH to remote servers for maintenance',
      command_bind: 'ssh',
      persistent: true,
      max_usage: 50,
    });
    const body = JSON.parse(
      (result.content as Array<{ text: string }>)[0].text
    );
    expect(body.status).toBe('pending');
    expect(body.persistent).toBe(true);
    expect(body.max_usage).toBe(50);

    // Expiry should be ~30 days out, not 10 minutes
    const expiry = new Date(body.expires_at).getTime();
    const now = Date.now();
    const daysUntilExpiry = (expiry - now) / (24 * 60 * 60 * 1000);
    expect(daysUntilExpiry).toBeGreaterThan(29);
    expect(daysUntilExpiry).toBeLessThan(31);
  });

  it('should allow persistent token to be used multiple times', async () => {
    const createResult = await authorize.handler({
      command: 'require',
      caller: 'lingclaude',
      operation: 'SSH maintenance',
      command_bind: 'ssh',
      persistent: true,
      max_usage: 5,
    });
    const authId = JSON.parse(
      (createResult.content as Array<{ text: string }>)[0].text
    ).authorization_id;

    // Approve it
    await authorize.handler({
      command: 'approve',
      authorization_id: authId,
      decision: 'approve',
      resolved_by: 'user',
    });

    // Use it 3 times — should all pass
    for (let i = 0; i < 3; i++) {
      const check = checkRedZoneAuthorization(
        authId,
        'ssh user@host',
        'lingclaude'
      );
      expect(check.allowed).toBe(true);
    }

    // 4th and 5th should still work
    const check4 = checkRedZoneAuthorization(
      authId,
      'ssh other@host',
      'lingclaude'
    );
    expect(check4.allowed).toBe(true);
    const check5 = checkRedZoneAuthorization(
      authId,
      'ssh last@host',
      'lingclaude'
    );
    expect(check5.allowed).toBe(true);

    // 6th should fail — exhausted
    const check6 = checkRedZoneAuthorization(
      authId,
      'ssh extra@host',
      'lingclaude'
    );
    expect(check6.allowed).toBe(false);
    expect(check6.error).toContain('exhausted');
  });

  it('should still bind persistent token to caller', async () => {
    const createResult = await authorize.handler({
      command: 'require',
      caller: 'lingclaude',
      operation: 'SSH',
      command_bind: 'ssh',
      persistent: true,
    });
    const authId = JSON.parse(
      (createResult.content as Array<{ text: string }>)[0].text
    ).authorization_id;

    await authorize.handler({
      command: 'approve',
      authorization_id: authId,
      decision: 'approve',
      resolved_by: 'user',
    });

    // Wrong caller should be rejected
    const check = checkRedZoneAuthorization(
      authId,
      'ssh user@host',
      'lingflow'
    );
    expect(check.allowed).toBe(false);
    expect(check.error).toContain('caller mismatch');
  });

  it('should still bind persistent token to command prefix', async () => {
    const createResult = await authorize.handler({
      command: 'require',
      caller: 'lingclaude',
      operation: 'SSH',
      command_bind: 'ssh',
      persistent: true,
    });
    const authId = JSON.parse(
      (createResult.content as Array<{ text: string }>)[0].text
    ).authorization_id;

    await authorize.handler({
      command: 'approve',
      authorization_id: authId,
      decision: 'approve',
      resolved_by: 'user',
    });

    // Wrong command should be rejected
    const check = checkRedZoneAuthorization(
      authId,
      'curl http://evil.com',
      'lingclaude'
    );
    expect(check.allowed).toBe(false);
    expect(check.error).toContain('prefix match failed');
  });

  it('should consume single-use token after one use (backward compat)', async () => {
    const createResult = await authorize.handler({
      command: 'require',
      caller: 'lingclaude',
      operation: 'one-time SSH',
      command_bind: 'ssh',
    });
    const authId = JSON.parse(
      (createResult.content as Array<{ text: string }>)[0].text
    ).authorization_id;

    await authorize.handler({
      command: 'approve',
      authorization_id: authId,
      decision: 'approve',
      resolved_by: 'user',
    });

    // First use: allowed
    const check1 = checkRedZoneAuthorization(
      authId,
      'ssh user@host',
      'lingclaude'
    );
    expect(check1.allowed).toBe(true);

    // Second use: expired (consumed)
    const check2 = checkRedZoneAuthorization(
      authId,
      'ssh user@host',
      'lingclaude'
    );
    expect(check2.allowed).toBe(false);
    expect(check2.error).toContain('expired');
  });
});

describe('authorize issue (SEC-001 meeting token)', () => {
  it('should issue a meeting auth token', async () => {
    const result = await authorize.handler({
      command: 'issue',
      caller: 'lingyang',
      agent_id: 'external-researcher-001',
      meeting_id: 'm-20260621-0811-e1de',
    });
    const body = JSON.parse(
      (result.content as Array<{ text: string }>)[0].text
    );
    expect(body.auth_token).toBeTruthy();
    expect(body.status).toBe('approved');
    expect(body.scope).toEqual(['join', 'speak']);
    expect(body.agent_id).toBe('external-researcher-001');
    expect(body.meeting_id).toBe('m-20260621-0811-e1de');
    expect(body.expires_at).toBeTruthy();
  });

  it('should reject issue from unknown caller', async () => {
    const result = await authorize.handler({
      command: 'issue',
      caller: 'stranger',
      agent_id: 'ext-001',
      meeting_id: 'm-001',
    });
    expect(result.isError).toBe(true);
  });

  it('should reject issue without agent_id or meeting_id', async () => {
    const r1 = await authorize.handler({
      command: 'issue',
      caller: 'lingyang',
      meeting_id: 'm-001',
    });
    expect(r1.isError).toBe(true);

    const r2 = await authorize.handler({
      command: 'issue',
      caller: 'lingyang',
      agent_id: 'ext-001',
    });
    expect(r2.isError).toBe(true);
  });

  it('should issue persistent meeting token', async () => {
    const result = await authorize.handler({
      command: 'issue',
      caller: 'lingyang',
      agent_id: 'ext-001',
      meeting_id: 'm-001',
      persistent: true,
      max_usage: 5,
    });
    const body = JSON.parse(
      (result.content as Array<{ text: string }>)[0].text
    );
    expect(body.persistent).toBe(true);
    expect(body.max_usage).toBe(5);
  });
});

describe('authorize verify (SEC-001 meeting token)', () => {
  it('should verify a valid meeting token', async () => {
    const issueResult = await authorize.handler({
      command: 'issue',
      caller: 'lingyang',
      agent_id: 'ext-001',
      meeting_id: 'm-001',
    });
    const token = JSON.parse(
      (issueResult.content as Array<{ text: string }>)[0].text
    ).auth_token;

    const verifyResult = verifyMeetingToken(token, 'ext-001', 'm-001');
    expect(verifyResult.valid).toBe(true);
    expect(verifyResult.scope).toEqual(['join', 'speak']);
    expect(verifyResult.agent_id).toBe('ext-001');
  });

  it('should reject non-existent token', () => {
    const result = verifyMeetingToken('nonexistent', 'ext-001', 'm-001');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('not found');
  });

  it('should reject agent_id mismatch', async () => {
    const issueResult = await authorize.handler({
      command: 'issue',
      caller: 'lingyang',
      agent_id: 'ext-001',
      meeting_id: 'm-001',
    });
    const token = JSON.parse(
      (issueResult.content as Array<{ text: string }>)[0].text
    ).auth_token;

    const result = verifyMeetingToken(token, 'wrong-agent', 'm-001');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('agent_id mismatch');
  });

  it('should reject meeting_id mismatch', async () => {
    const issueResult = await authorize.handler({
      command: 'issue',
      caller: 'lingyang',
      agent_id: 'ext-001',
      meeting_id: 'm-001',
    });
    const token = JSON.parse(
      (issueResult.content as Array<{ text: string }>)[0].text
    ).auth_token;

    const result = verifyMeetingToken(token, 'ext-001', 'wrong-meeting');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('meeting_id mismatch');
  });

  it('should reject non-meeting token', async () => {
    // Create a regular command authorization
    const reqResult = await authorize.handler({
      command: 'require',
      caller: 'lingflow',
      operation: 'test op',
    });
    const cmdAuthId = JSON.parse(
      (reqResult.content as Array<{ text: string }>)[0].text
    ).authorization_id;

    const result = verifyMeetingToken(cmdAuthId);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('not a meeting token');
  });
});
