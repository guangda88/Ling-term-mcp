/**
 * Tool: create_session
 */

import { createSession } from '../../src/tools/create_session';
import { clearSessions } from '../../src/sessions/store';
import * as path from 'path';
import * as fs from 'fs';

beforeEach(() => {
  clearSessions();
});

describe('create_session', () => {
  it('should create a session with defaults', async () => {
    const result = await createSession.handler({});

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('Session created successfully');

    const sessionMatch = result.content[0].text!.match(/"id":\s*"([^"]+)"/);
    expect(sessionMatch).not.toBeNull();
  });

  it('should create a session with custom name', async () => {
    const result = await createSession.handler({
      name: 'my-session',
    });

    expect(result.content[0].text).toContain('my-session');
  });

  it('should create a session with valid working directory', async () => {
    const result = await createSession.handler({
      name: 'temp-session',
      working_directory: '/tmp',
    });

    expect(result.content[0].text).toContain('/tmp');
  });

  it('should reject non-existent working directory', async () => {
    await expect(
      createSession.handler({
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
        createSession.handler({
          name: 'file-session',
          working_directory: tmpFile,
        })
      ).rejects.toThrow();
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('should auto-generate session name when not provided', async () => {
    const result = await createSession.handler({});

    const nameMatch = result.content[0].text!.match(/"name":\s*"session-/);
    expect(nameMatch).not.toBeNull();
  });
});
