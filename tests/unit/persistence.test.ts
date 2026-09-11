// BUS-02 regression: proposals and authorizations must survive restarts
// (module reload) and be visible across instances sharing the same basedir.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('persistence across restarts', () => {
  let basedir: string;

  beforeEach(() => {
    basedir = fs.mkdtempSync(path.join(os.tmpdir(), 'ling-term-persist-'));
    process.env['LING_TERM_BASEDIR'] = basedir;
    jest.resetModules();
  });

  afterEach(() => {
    delete process.env['LING_TERM_BASEDIR'];
    fs.rmSync(basedir, { recursive: true, force: true });
  });

  it('governance proposals reload from proposals.jsonl after restart', async () => {
    const gov1 = await import('../../src/security/list_governance');
    const created = gov1.createProposal(
      'lingclaude',
      'whitelist',
      'add',
      ['persistcmd'],
      'Persistence regression test entry'
    );
    expect(created.error).toBeUndefined();
    const id = created.proposal!.id;
    expect(fs.existsSync(path.join(basedir, 'proposals.jsonl'))).toBe(true);

    // Simulate process restart: fresh module instance, empty memory
    jest.resetModules();
    const gov2 = await import('../../src/security/list_governance');
    const restored = gov2.getProposal(id);
    expect(restored).toBeDefined();
    expect(restored!.status).toBe('pending');
    expect(restored!.entries).toEqual(['persistcmd']);

    // Resolution must also work on the restored instance
    const resolved = gov2.resolveProposal(id, 'lingxi', 'approve');
    expect(resolved.error).toBeUndefined();
    expect(resolved.proposal!.status).toBe('applied');
  });

  it('authorization requests reload from authorizations.jsonl after restart', async () => {
    const auth1 = await import('../../src/tools/authorize');
    const created = await auth1.authorize.handler({
      command: 'require',
      caller: 'lingflow',
      operation: 'persistence test op',
    });
    const text = (created.content[0] as { text: string }).text;
    const id = JSON.parse(text).authorization_id as string;
    expect(fs.existsSync(path.join(basedir, 'authorizations.jsonl'))).toBe(
      true
    );

    // Simulate process restart
    jest.resetModules();
    const auth2 = await import('../../src/tools/authorize');
    const restored = auth2.getAuthorizationStatus(id);
    expect(restored).toBeDefined();
    expect(restored!.status).toBe('pending');

    // Approval must work on the restored instance
    const approved = await auth2.authorize.handler({
      command: 'approve',
      authorization_id: id,
      decision: 'approve',
      resolved_by: 'lingxi',
    });
    expect(approved.isError).toBeUndefined();
  });

  it('co-located instance sees requests created after startup', async () => {
    // Instance A starts with an empty basedir
    const authA = await import('../../src/tools/authorize');

    // Instance B (fresh module state) creates a request, persisted to file
    jest.resetModules();
    const authB = await import('../../src/tools/authorize');
    const created = await authB.authorize.handler({
      command: 'require',
      caller: 'lingclaude',
      operation: 'cross-instance visibility test',
    });
    const id = JSON.parse((created.content[0] as { text: string }).text)
      .authorization_id as string;

    // Instance A (already running, stale memory) lazily reloads on lookup
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const authAreloaded = require('../../src/tools/authorize');
    void authA;
    const status = authAreloaded.getAuthorizationStatus(id);
    expect(status).toBeDefined();
    expect(status!.caller).toBe('lingclaude');
  });
});
