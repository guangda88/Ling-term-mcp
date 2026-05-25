import {
  requireAuthorization,
  approveAuthorization,
  listAuthorizations,
  _resetForTesting,
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

describe('require_authorization', () => {
  it('should create a pending authorization request', async () => {
    const result = await requireAuthorization.handler({
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
    const result = await requireAuthorization.handler({
      caller: 'stranger',
      operation: 'do something',
    });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0].text).toContain(
      'not a registered'
    );
  });

  it('should reject missing caller', async () => {
    const result = await requireAuthorization.handler({
      operation: 'do something',
    });
    expect(result.isError).toBe(true);
  });

  it('should reject missing operation', async () => {
    const result = await requireAuthorization.handler({
      caller: 'lingflow',
    });
    expect(result.isError).toBe(true);
  });

  it('should accept details object', async () => {
    const result = await requireAuthorization.handler({
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

describe('approve_authorization', () => {
  it('should approve a pending request', async () => {
    const createResult = await requireAuthorization.handler({
      caller: 'lingflow',
      operation: 'deploy to production',
    });
    const { authorization_id } = JSON.parse(
      (createResult.content as Array<{ text: string }>)[0].text
    );

    const approveResult = await approveAuthorization.handler({
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
    const createResult = await requireAuthorization.handler({
      caller: 'lingclaude',
      operation: 'rm -rf /tmp/test',
    });
    const { authorization_id } = JSON.parse(
      (createResult.content as Array<{ text: string }>)[0].text
    );

    const rejectResult = await approveAuthorization.handler({
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
    const createResult = await requireAuthorization.handler({
      caller: 'lingflow',
      operation: 'test op',
    });
    const { authorization_id } = JSON.parse(
      (createResult.content as Array<{ text: string }>)[0].text
    );

    const result = await approveAuthorization.handler({
      authorization_id,
      decision: 'approve',
      resolved_by: 'hacker',
    });
    expect(result.isError).toBe(true);
  });

  it('should reject already resolved request', async () => {
    const createResult = await requireAuthorization.handler({
      caller: 'lingflow',
      operation: 'test op',
    });
    const { authorization_id } = JSON.parse(
      (createResult.content as Array<{ text: string }>)[0].text
    );

    await approveAuthorization.handler({
      authorization_id,
      decision: 'approve',
      resolved_by: 'lingflow_plus',
    });

    const result = await approveAuthorization.handler({
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
    const result = await approveAuthorization.handler({
      authorization_id: 'nonexistent-id',
      decision: 'approve',
      resolved_by: 'lingflow_plus',
    });
    expect(result.isError).toBe(true);
  });
});

describe('list_authorizations', () => {
  it('should list all requests', async () => {
    await requireAuthorization.handler({
      caller: 'lingflow',
      operation: 'op1',
    });
    await requireAuthorization.handler({
      caller: 'lingxi',
      operation: 'op2',
    });

    const result = await listAuthorizations.handler({});
    const body = JSON.parse(
      (result.content as Array<{ text: string }>)[0].text
    );
    expect(body.total).toBe(2);
  });

  it('should filter by caller', async () => {
    await requireAuthorization.handler({
      caller: 'lingflow',
      operation: 'op1',
    });
    await requireAuthorization.handler({
      caller: 'lingxi',
      operation: 'op2',
    });

    const result = await listAuthorizations.handler({ caller: 'lingflow' });
    const body = JSON.parse(
      (result.content as Array<{ text: string }>)[0].text
    );
    expect(body.total).toBe(1);
    expect(body.requests[0].caller).toBe('lingflow');
  });

  it('should filter by status', async () => {
    const createResult = await requireAuthorization.handler({
      caller: 'lingflow',
      operation: 'op1',
    });
    const { authorization_id } = JSON.parse(
      (createResult.content as Array<{ text: string }>)[0].text
    );
    await approveAuthorization.handler({
      authorization_id,
      decision: 'approve',
      resolved_by: 'lingflow_plus',
    });

    const result = await listAuthorizations.handler({ status: 'pending' });
    const body = JSON.parse(
      (result.content as Array<{ text: string }>)[0].text
    );
    expect(body.total).toBe(0);
  });
});
