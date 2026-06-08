/**
 * Tool: session (consolidated)
 * Replaces: create_session, list_sessions, destroy_session, sync_terminal
 */

import { session } from '../../src/tools/session';
import {
  saveSession,
  getSession,
  clearSessions,
} from '../../src/sessions/store';
import * as path from 'path';
import * as fs from 'fs';

beforeEach(async () => {
  await clearSessions();
});

describe('session list', () => {
  it('should return empty list when no sessions', async () => {
    const result = await session.handler({ command: 'list' });

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('No active sessions');
  });

  it('should list existing sessions', async () => {
    const now = new Date().toISOString();
    await saveSession({
      id: 'list-1',
      name: 'session-1',
      working_directory: '/tmp',
      created_at: now,
      status: 'active',
    });
    await saveSession({
      id: 'list-2',
      name: 'session-2',
      working_directory: '/home',
      created_at: now,
      status: 'active',
    });

    const result = await session.handler({ command: 'list' });

    expect(result.content[0].text).toContain('2 active session');
    expect(result.content[0].text).toContain('list-1');
    expect(result.content[0].text).toContain('list-2');
  });

  it('should include session details in listing', async () => {
    await saveSession({
      id: 'detail-id',
      name: 'detail-session',
      working_directory: '/tmp',
      created_at: '2026-01-01T00:00:00.000Z',
      status: 'active',
    });

    const result = await session.handler({ command: 'list' });

    expect(result.content[0].text).toContain('detail-id');
    expect(result.content[0].text).toContain('detail-session');
    expect(result.content[0].text).toContain('/tmp');
  });
});

describe('session create', () => {
  it('should create a session with defaults', async () => {
    const result = await session.handler({ command: 'create' });

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('Session created successfully');

    const sessionMatch = result.content[0].text!.match(/"id":\s*"([^"]+)"/);
    expect(sessionMatch).not.toBeNull();
  });

  it('should create a session with custom name', async () => {
    const result = await session.handler({
      command: 'create',
      name: 'my-session',
    });

    expect(result.content[0].text).toContain('my-session');
  });

  it('should create a session with valid working directory', async () => {
    const result = await session.handler({
      command: 'create',
      name: 'temp-session',
      working_directory: '/tmp',
    });

    expect(result.content[0].text).toContain('/tmp');
  });

  it('should reject non-existent working directory', async () => {
    await expect(
      session.handler({
        command: 'create',
        name: 'bad-session',
        working_directory: '/nonexistent/path/that/does/not/exist',
      })
    ).rejects.toThrow('Working directory does not exist');
  });

  it('should reject working directory that is a file', async () => {
    const tmpFile = path.join('/tmp', `test-file-${Date.now()}`);
    fs.writeFileSync(tmpFile, 'test');

    try {
      await expect(
        session.handler({
          command: 'create',
          name: 'file-session',
          working_directory: tmpFile,
        })
      ).rejects.toThrow();
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('should auto-generate session name when not provided', async () => {
    const result = await session.handler({ command: 'create' });

    const nameMatch = result.content[0].text!.match(/"name":\s*"session-/);
    expect(nameMatch).not.toBeNull();
  });
});

describe('session destroy', () => {
  it('should destroy an existing session', async () => {
    await saveSession({
      id: 'destroy-test-id',
      name: 'to-destroy',
      working_directory: '/tmp',
      created_at: new Date().toISOString(),
      status: 'active',
    });

    const result = await session.handler({
      command: 'destroy',
      session_id: 'destroy-test-id',
    });

    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('destroyed successfully');
    expect(result.content[0].text).toContain('destroy-test-id');

    const deleted = await getSession('destroy-test-id');
    expect(deleted).toBeUndefined();
  });

  it('should require session_id', async () => {
    await expect(
      session.handler({ command: 'destroy', session_id: '' })
    ).rejects.toThrow('Session ID is required');
  });

  it('should reject non-existent session', async () => {
    await expect(
      session.handler({
        command: 'destroy',
        session_id: 'nonexistent-id',
      })
    ).rejects.toThrow('Session not found');
  });
});

describe('session sync', () => {
  it('should sync terminal state for valid session', async () => {
    await saveSession({
      id: 'test-session-id',
      name: 'test',
      working_directory: '/tmp',
      created_at: new Date().toISOString(),
      status: 'active',
    });

    const result = await session.handler({
      command: 'sync',
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
    await expect(
      session.handler({ command: 'sync', session_id: '' })
    ).rejects.toThrow('Session ID is required');
  });

  it('should reject non-existent session', async () => {
    await expect(
      session.handler({
        command: 'sync',
        session_id: 'nonexistent-session',
      })
    ).rejects.toThrow('Session not found');
  });

  it('should include session working_directory', async () => {
    await saveSession({
      id: 'custom-dir-session',
      name: 'custom',
      working_directory: '/home',
      created_at: new Date().toISOString(),
      status: 'active',
    });

    const result = await session.handler({
      command: 'sync',
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

    const result = await session.handler({
      command: 'sync',
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

    const result = await session.handler({
      command: 'sync',
      session_id: 'history-session',
    });

    const state = JSON.parse(result.content[0].text!);
    expect(state.command_history).toBeDefined();
    expect(state.command_history).toEqual(['echo hello', 'pwd']);
  });
});
