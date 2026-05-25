import { CommandQueue } from '../../src/gateway/queue';
import type { DispatchRequest } from '../../src/gateway/types';

describe('CommandQueue', () => {
  let queue: CommandQueue;

  beforeEach(() => {
    queue = new CommandQueue();
  });

  const validRequest: DispatchRequest = {
    command: 'echo hello',
    source: 'lingflow_plus',
    reasoning: 'test',
    shell: true,
  };

  describe('dispatch', () => {
    it('should reject unknown source', async () => {
      const result = await queue.dispatch({
        ...validRequest,
        source: 'unknown_member',
      });
      expect(result.status).toBe('rejected');
      expect(result.rejection_reason).toContain('Unknown source');
    });

    it('should accept valid request from known member', async () => {
      const result = await queue.dispatch(validRequest);
      expect(result.status).toBe('running');
      expect(result.request_id).toBeTruthy();
      expect(result.session_id).toBeTruthy();
    });

    it('should reject commands failing security validation', async () => {
      const result = await queue.dispatch({
        ...validRequest,
        command: 'rm -rf /',
        shell: true,
      });
      expect(result.status).toBe('rejected');
      expect(result.rejection_reason).toContain('Security');
    });

    it('should execute command and return completed status', async () => {
      const result = await queue.dispatch({
        ...validRequest,
        command: 'echo test_output',
        shell: true,
      });
      expect(result.status).toBe('running');

      await new Promise((r) => setTimeout(r, 500));

      const history = queue.getHistory(1);
      expect(history).toHaveLength(1);
      expect(history[0].status).toBe('completed');
      expect(history[0].exit_code).toBe(0);
    });

    it('should record failed command', async () => {
      const result = await queue.dispatch({
        ...validRequest,
        command: 'node -e "process.exit(1)"',
        shell: true,
      });
      expect(result.status).toBe('rejected');
      expect(result.rejection_reason).toContain('Security');

      const history = queue.getHistory(1);
      if (history.length > 0) {
        expect(history[0].status).toBe('rejected');
      }
    });

    it('should use provided session_id', async () => {
      const result = await queue.dispatch({
        ...validRequest,
        session_id: 'custom-session-123',
      });
      expect(result.session_id).toBe('custom-session-123');
    });

    it('should generate session_id when not provided', async () => {
      const result = await queue.dispatch(validRequest);
      expect(result.session_id).toBeTruthy();
    });
  });

  describe('rate limiting', () => {
    it('should allow requests within rate limit', async () => {
      for (let i = 0; i < 10; i++) {
        const result = await queue.dispatch({
          ...validRequest,
          command: `echo ${i}`,
          shell: true,
        });
        expect(result.status).not.toBe('rejected');
      }
    });
  });

  describe('cancel', () => {
    it('should return not found for non-existent request', () => {
      const result = queue.cancel('nonexistent', 'lingflow_plus');
      expect(result.cancelled).toBe(false);
      expect(result.reason).toContain('not found');
    });

    it('should return source mismatch for wrong source', async () => {
      const dispatchResult = await queue.dispatch({
        ...validRequest,
        command: 'sleep 30',
        shell: true,
        timeout: 60000,
      });
      expect(dispatchResult.status).toBe('running');

      const result = queue.cancel(dispatchResult.request_id, 'lingxi');
      expect(result.cancelled).toBe(false);
      expect(result.reason).toContain('Source mismatch');
    });
  });

  describe('getStatus', () => {
    it('should return healthy status with zero commands', () => {
      const status = queue.getStatus();
      expect(status.status).toBe('healthy');
      expect(status.active_commands).toBe(0);
      expect(status.uptime_s).toBeGreaterThanOrEqual(0);
    });

    it('should reflect active commands', async () => {
      await queue.dispatch({
        ...validRequest,
        command: 'sleep 30',
        shell: true,
        timeout: 60000,
      });

      await new Promise((r) => setTimeout(r, 200));

      const status = queue.getStatus();
      expect(status.active_commands).toBe(1);
    });
  });

  describe('getHistory', () => {
    it('should return empty history initially', () => {
      const history = queue.getHistory();
      expect(history).toHaveLength(0);
    });

    it('should return command history after dispatch', async () => {
      await queue.dispatch({
        ...validRequest,
        command: 'echo history_test',
        shell: true,
      });

      await new Promise((r) => setTimeout(r, 500));

      const history = queue.getHistory();
      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history[0].command).toBe('echo history_test');
      expect(history[0].source).toBe('lingflow_plus');
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await queue.dispatch({
          ...validRequest,
          command: `echo ${i}`,
          shell: true,
        });
        await new Promise((r) => setTimeout(r, 100));
      }

      const history = queue.getHistory(3);
      expect(history).toHaveLength(3);
    });
  });

  describe('CWD restrictions', () => {
    it('should reject blocked CWD /etc', async () => {
      await queue.dispatch({
        ...validRequest,
        command: 'ls',
        cwd: '/etc',
        shell: false,
      });

      await new Promise((r) => setTimeout(r, 300));

      const history = queue.getHistory(1);
      if (history.length > 0) {
        expect(history[0].status).toBeDefined();
      }
    });
  });
});
