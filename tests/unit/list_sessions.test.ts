/**
 * Tool: list_sessions
 */

import { listSessions } from '../../src/tools/list_sessions';
import { saveSession, clearSessions } from '../../src/sessions/store';

beforeEach(async () => {
  await clearSessions();
});

describe('list_sessions', () => {
  it('should return empty list when no sessions', async () => {
    const result = await listSessions.handler();

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

    const result = await listSessions.handler();

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

    const result = await listSessions.handler();

    expect(result.content[0].text).toContain('detail-id');
    expect(result.content[0].text).toContain('detail-session');
    expect(result.content[0].text).toContain('/tmp');
  });
});
