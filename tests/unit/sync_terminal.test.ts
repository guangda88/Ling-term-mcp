/**
 * Tool: sync_terminal
 */

import { syncTerminal } from '../../src/tools/sync_terminal';

describe('sync_terminal', () => {
  it('should sync terminal state', async () => {
    const result = await syncTerminal.handler({
      session_id: 'test-session-id',
    });

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');

    const state = JSON.parse(result.content[0].text);
    expect(state.session_id).toBe('test-session-id');
    expect(state.working_directory).toBeDefined();
    expect(state.user).toBeDefined();
    expect(state.platform).toBeDefined();
  });

  it('should require session_id parameter', async () => {
    await expect(syncTerminal.handler({ session_id: '' })).rejects.toThrow();
  });
});
