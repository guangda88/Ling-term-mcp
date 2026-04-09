/**
 * Tool: sync_terminal
 */

import { syncTerminal } from '../../src/tools/sync_terminal';
import { saveSession, clearSessions } from '../../src/sessions/store';

beforeEach(async () => {
  await clearSessions();
});

describe('sync_terminal', () => {
  it('should sync terminal state for valid session', async () => {
    await saveSession({
      id: 'test-session-id',
      name: 'test',
      working_directory: '/tmp',
      created_at: new Date().toISOString(),
      status: 'active',
    });

    const result = await syncTerminal.handler({
      session_id: 'test-session-id',
    });

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');

    const state = JSON.parse(result.content[0].text!);
    expect(state.session_id).toBe('test-session-id');
    expect(state.working_directory).toBe('/tmp');
    expect(state.user).toBeDefined();
    expect(state.platform).toBeDefined();
    expect(state.timestamp).toBeDefined();
  });

  it('should require session_id parameter', async () => {
    await expect(syncTerminal.handler({ session_id: '' })).rejects.toThrow(
      'Session ID is required'
    );
  });

  it('should reject non-existent session', async () => {
    await expect(
      syncTerminal.handler({ session_id: 'nonexistent-session' })
    ).rejects.toThrow('Session not found');
  });

  it('should include session working_directory instead of process.cwd()', async () => {
    await saveSession({
      id: 'custom-dir-session',
      name: 'custom',
      working_directory: '/home',
      created_at: new Date().toISOString(),
      status: 'active',
    });

    const result = await syncTerminal.handler({
      session_id: 'custom-dir-session',
    });

    const state = JSON.parse(result.content[0].text!);
    expect(state.working_directory).toBe('/home');
  });

  it('should include session environment', async () => {
    await saveSession({
      id: 'env-session',
      name: 'env',
      working_directory: '/tmp',
      created_at: new Date().toISOString(),
      status: 'active',
      environment: { MY_VAR: 'hello' },
    });

    const result = await syncTerminal.handler({
      session_id: 'env-session',
    });

    const state = JSON.parse(result.content[0].text!);
    expect(state.environment).toBeDefined();
    expect(state.environment.MY_VAR).toBe('hello');
  });

  it('should include command history', async () => {
    await saveSession({
      id: 'history-session',
      name: 'history',
      working_directory: '/tmp',
      created_at: new Date().toISOString(),
      status: 'active',
      command_history: ['echo hello', 'pwd'],
    });

    const result = await syncTerminal.handler({
      session_id: 'history-session',
    });

    const state = JSON.parse(result.content[0].text!);
    expect(state.command_history).toBeDefined();
    expect(state.command_history).toEqual(['echo hello', 'pwd']);
  });
});
