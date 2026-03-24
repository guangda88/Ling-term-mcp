/**
 * Session Manager Tests
 */

// Mock uuid to return different values
let uuidCounter = 0;
jest.mock('uuid', () => ({
  v4: jest.fn(() => {
    const id = `123e4567-e89b-12d3-a456-42661417${String(uuidCounter).padStart(4, '0')}`;
    uuidCounter++;
    return id;
  }),
}));

import { SessionManager } from '../../src/sessions/manager';
import * as fs from 'fs';
import * as path from 'path';

// Clean up session storage before each test
const SESSIONS_FILE = path.join(process.cwd(), '.ling-term-mcp', 'sessions.json');

beforeEach(() => {
  if (fs.existsSync(SESSIONS_FILE)) {
    fs.unlinkSync(SESSIONS_FILE);
  }
});

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
  });

  it('should create a new session', async () => {
    const sessionId = await manager.create({
      name: 'test-session',
    });

    expect(sessionId).toBeDefined();
    expect(sessionId).toMatch(/^[a-f0-9-]+$/);
  });

  it('should retrieve a session', async () => {
    const sessionId = await manager.create({
      name: 'test-session',
    });

    const session = await manager.get(sessionId);

    expect(session).toBeDefined();
    expect(session?.name).toBe('test-session');
    expect(session?.status).toBe('active');
  });

  it('should list all sessions', async () => {
    const initialCount = (await manager.list()).length;

    await manager.create({ name: 'session-1' });
    await manager.create({ name: 'session-2' });
    await manager.create({ name: 'session-3' });

    const sessions = await manager.list();

    expect(sessions.length).toBe(initialCount + 3);
  });

  it('should update a session', async () => {
    const sessionId = await manager.create({ name: 'original-name' });

    await manager.update(sessionId, { name: 'updated-name' });

    const session = await manager.get(sessionId);
    expect(session?.name).toBe('updated-name');
  });

  it('should destroy a session', async () => {
    const sessionId = await manager.create({ name: 'to-be-destroyed' });

    await manager.destroy(sessionId);

    const session = await manager.get(sessionId);
    expect(session).toBeUndefined();
  });
});
