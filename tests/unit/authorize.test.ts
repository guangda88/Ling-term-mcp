import {
  authorize,
  _resetForTesting,
  checkRedZoneAuthorization,
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
