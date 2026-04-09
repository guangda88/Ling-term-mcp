/**
 * Session Store Tests
 */

import {
  saveSession,
  getSession,
  getSessions,
  updateSession,
  deleteSession,
  clearSessions,
} from '../../src/sessions/store';

beforeEach(async () => {
  await clearSessions();
});

describe('Session Store', () => {
  it('should save and retrieve a session', async () => {
    const session = {
      id: 'test-1',
      name: 'test-session',
      working_directory: '/tmp',
      created_at: new Date().toISOString(),
      status: 'active' as const,
    };

    await saveSession(session);
    const retrieved = await getSession('test-1');

    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('test-session');
    expect(retrieved?.status).toBe('active');
  });

  it('should list all sessions', async () => {
    await saveSession({
      id: 's-1',
      name: 'session-1',
      working_directory: '/tmp',
      created_at: new Date().toISOString(),
      status: 'active',
    });
    await saveSession({
      id: 's-2',
      name: 'session-2',
      working_directory: '/tmp',
      created_at: new Date().toISOString(),
      status: 'active',
    });
    await saveSession({
      id: 's-3',
      name: 'session-3',
      working_directory: '/tmp',
      created_at: new Date().toISOString(),
      status: 'active',
    });

    const sessions = await getSessions();
    expect(sessions.length).toBe(3);
  });

  it('should update a session', async () => {
    await saveSession({
      id: 'test-upd',
      name: 'original-name',
      working_directory: '/tmp',
      created_at: new Date().toISOString(),
      status: 'active',
    });

    await updateSession('test-upd', { name: 'updated-name' });

    const session = await getSession('test-upd');
    expect(session?.name).toBe('updated-name');
  });

  it('should delete a session', async () => {
    await saveSession({
      id: 'test-del',
      name: 'to-be-deleted',
      working_directory: '/tmp',
      created_at: new Date().toISOString(),
      status: 'active',
    });

    await deleteSession('test-del');

    const session = await getSession('test-del');
    expect(session).toBeUndefined();
  });

  it('should return undefined for non-existent session', async () => {
    const session = await getSession('nonexistent');
    expect(session).toBeUndefined();
  });

  it('should clear all sessions', async () => {
    await saveSession({
      id: 's-a',
      name: 'a',
      working_directory: '/tmp',
      created_at: new Date().toISOString(),
      status: 'active',
    });
    await saveSession({
      id: 's-b',
      name: 'b',
      working_directory: '/tmp',
      created_at: new Date().toISOString(),
      status: 'active',
    });

    await clearSessions();

    const sessions = await getSessions();
    expect(sessions.length).toBe(0);
  });

  it('should cleanup inactive sessions older than maxAge', async () => {
    const oldId = 'old-session';
    const recentId = 'recent-session';
    const activeId = 'active-session';

    await saveSession({
      id: oldId,
      name: 'old',
      working_directory: '/tmp',
      created_at: new Date(Date.now() - 7200000).toISOString(),
      status: 'inactive',
    });
    await saveSession({
      id: recentId,
      name: 'recent',
      working_directory: '/tmp',
      created_at: new Date(Date.now() - 1000).toISOString(),
      status: 'inactive',
    });
    await saveSession({
      id: activeId,
      name: 'active',
      working_directory: '/tmp',
      created_at: new Date(Date.now() - 7200000).toISOString(),
      status: 'active',
    });

    const allSessions = await getSessions();
    const maxAge = 3600000;
    let cleaned = 0;

    for (const session of allSessions) {
      const createdAt = new Date(session.created_at).getTime();
      const age = Date.now() - createdAt;
      if (age > maxAge && session.status === 'inactive') {
        await deleteSession(session.id);
        cleaned++;
      }
    }

    expect(cleaned).toBe(1);
    expect(await getSession(oldId)).toBeUndefined();
    expect(await getSession(recentId)).toBeDefined();
    expect(await getSession(activeId)).toBeDefined();
  });

  it('should save session with environment', async () => {
    await saveSession({
      id: 'env-session',
      name: 'env-session',
      working_directory: '/tmp',
      created_at: new Date().toISOString(),
      status: 'active',
      environment: {
        PATH: process.env.PATH || '',
        HOME: process.env.HOME || '',
      },
    });

    const session = await getSession('env-session');
    expect(session?.environment).toBeDefined();
    expect(session?.environment?.PATH).toBeDefined();
  });

  it('should update session working directory', async () => {
    await saveSession({
      id: 'cwd-session',
      name: 'cwd-session',
      working_directory: '/tmp',
      created_at: new Date().toISOString(),
      status: 'active',
    });

    await updateSession('cwd-session', { working_directory: '/var' });

    const session = await getSession('cwd-session');
    expect(session?.working_directory).toBe('/var');
  });
});
