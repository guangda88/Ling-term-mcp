/**
 * Tool: destroy_session
 */

import { destroySession } from '../../src/tools/destroy_session';
import {
  saveSession,
  getSession,
  clearSessions,
} from '../../src/sessions/store';

beforeEach(async () => {
  await clearSessions();
});

describe('destroy_session', () => {
  it('should destroy an existing session', async () => {
    await saveSession({
      id: 'destroy-test-id',
      name: 'to-destroy',
      working_directory: '/tmp',
      created_at: new Date().toISOString(),
      status: 'active',
    });

    const result = await destroySession.handler({
      session_id: 'destroy-test-id',
    });

    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('destroyed successfully');
    expect(result.content[0].text).toContain('destroy-test-id');

    const deleted = await getSession('destroy-test-id');
    expect(deleted).toBeUndefined();
  });

  it('should require session_id', async () => {
    await expect(destroySession.handler({ session_id: '' })).rejects.toThrow(
      'Session ID is required'
    );
  });

  it('should reject non-existent session', async () => {
    await expect(
      destroySession.handler({ session_id: 'nonexistent-id' })
    ).rejects.toThrow('Session not found');
  });
});
