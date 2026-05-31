/**
 * Integration Tests
 * Tests the full flow: session creation → command execution → state sync → destruction
 */

import { createSession } from '../../src/tools/create_session';
import { destroySession } from '../../src/tools/destroy_session';
import { executeCommand } from '../../src/tools/execute_command';
import { syncTerminal } from '../../src/tools/sync_terminal';
import { listSessions } from '../../src/tools/list_sessions';
import { clearSessions, getSession } from '../../src/sessions/store';

beforeEach(async () => {
  await clearSessions();
});

describe('Integration: Full session lifecycle', () => {
  it('should create session, execute commands, sync state, and destroy', async () => {
    const createResult = await createSession.handler({
      name: 'integration-test',
      working_directory: '/tmp',
    });

    expect(createResult.content[0].type).toBe('text');
    expect(createResult.content[0].text).toContain('Session created');

    const sessionMatch =
      createResult.content[0].text!.match(/"id":\s*"([^"]+)"/);
    expect(sessionMatch).toBeDefined();
    const sessionId = sessionMatch![1];

    const pwdResult = await executeCommand.handler({
      command: 'pwd',
      session_id: sessionId,
      caller: 'lingxi',
    });
    expect(pwdResult.content[0].text.trim()).toBe('/tmp');

    const syncResult = await syncTerminal.handler({
      session_id: sessionId,
    });
    const state = JSON.parse(syncResult.content[0].text!);
    expect(state.working_directory).toBe('/tmp');

    const destroyResult = await destroySession.handler({
      session_id: sessionId,
    });
    expect(destroyResult.content[0].text).toContain('destroyed');
  });

  it('should handle shell mode with cd and pipes across session', async () => {
    const createResult = await createSession.handler({
      name: 'shell-session',
      working_directory: '/tmp',
    });

    const sessionMatch =
      createResult.content[0].text!.match(/"id":\s*"([^"]+)"/);
    const sessionId = sessionMatch![1];

    await executeCommand.handler({
      command: 'cd /home',
      shell: true,
      session_id: sessionId,
      caller: 'lingxi',
    });

    const pwdResult = await executeCommand.handler({
      command: 'pwd',
      session_id: sessionId,
      caller: 'lingxi',
    });
    expect(pwdResult.content[0].text.trim()).toBe('/home');

    const pipeResult = await executeCommand.handler({
      command: 'ls -1 | head -5',
      shell: true,
      session_id: sessionId,
      caller: 'lingxi',
    });
    expect(pipeResult.content[0].type).toBe('text');

    await destroySession.handler({ session_id: sessionId });
  });

  it('should handle multiple concurrent sessions', async () => {
    const sessions = [];

    for (let i = 0; i < 3; i++) {
      const result = await createSession.handler({
        name: `concurrent-${i}`,
        working_directory: '/tmp',
      });
      const id = result.content[0].text!.match(/"id":\s*"([^"]+)"/)![1];
      sessions.push(id);
    }

    const listResult = await listSessions.handler();
    expect(listResult.content[0].text).toContain('3 active session');
    expect(listResult.content[0].text).toContain('concurrent-0');
    expect(listResult.content[0].text).toContain('concurrent-1');
    expect(listResult.content[0].text).toContain('concurrent-2');

    for (const sessionId of sessions) {
      const result = await executeCommand.handler({
        command: 'echo',
        args: [sessionId.slice(0, 8)],
        session_id: sessionId,
        caller: 'lingxi',
      });
      expect(result.content[0].text).toContain(sessionId.slice(0, 8));
    }

    for (const sessionId of sessions) {
      await destroySession.handler({ session_id: sessionId });
    }

    const finalList = await listSessions.handler();
    expect(finalList.content[0].text).toContain('No active sessions');
  });

  it('should maintain separate environment per session', async () => {
    const s1 = await createSession.handler({
      name: 'env1',
      working_directory: '/tmp',
    });
    const s2 = await createSession.handler({
      name: 'env2',
      working_directory: '/tmp',
    });

    const id1 = s1.content[0].text!.match(/"id":\s*"([^"]+)"/)![1];
    const id2 = s2.content[0].text!.match(/"id":\s*"([^"]+)"/)![1];

    await executeCommand.handler({
      command: 'export SESSION_ONE=true',
      shell: true,
      session_id: id1,
      caller: 'lingxi',
    });

    await executeCommand.handler({
      command: 'export SESSION_TWO=true',
      shell: true,
      session_id: id2,
      caller: 'lingxi',
    });

    const session1 = await getSession(id1);
    const session2 = await getSession(id2);

    expect(session1?.environment?.SESSION_ONE).toBe('true');
    expect(session1?.environment?.SESSION_TWO).toBeUndefined();
    expect(session2?.environment?.SESSION_TWO).toBe('true');
    expect(session2?.environment?.SESSION_ONE).toBeUndefined();

    await destroySession.handler({ session_id: id1 });
    await destroySession.handler({ session_id: id2 });
  });

  it('should track command history per session', async () => {
    const result = await createSession.handler({
      name: 'history-test',
      working_directory: '/tmp',
    });
    const id = result.content[0].text!.match(/"id":\s*"([^"]+)"/)![1];

    await executeCommand.handler({
      command: 'echo first',
      shell: true,
      session_id: id,
      caller: 'lingxi',
    });
    await executeCommand.handler({
      command: 'echo second',
      shell: true,
      session_id: id,
      caller: 'lingxi',
    });

    await new Promise((r) => setTimeout(r, 100));

    const sync = await syncTerminal.handler({ session_id: id });
    const state = JSON.parse(sync.content[0].text!);
    expect(state.command_history).toContainEqual('echo first');
    expect(state.command_history).toContainEqual('echo second');

    await destroySession.handler({ session_id: id });
  });
});

describe('Integration: Timeout handling', () => {
  it('should timeout long-running commands', async () => {
    const result = await executeCommand.handler({
      command: 'node',
      args: ['-e', 'setTimeout(()=>{},30000)'],
      timeout: 1000,
      caller: 'lingxi',
    });

    expect(result.isError).toBe(true);
  }, 10000);
});
