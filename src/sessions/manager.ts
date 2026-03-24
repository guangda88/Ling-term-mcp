/**
 * Session Manager
 * Manages terminal session lifecycle
 */

import { v4 as uuidv4 } from 'uuid';
import * as os from 'os';
import {
  saveSession,
  getSession,
  getSessions,
  deleteSession,
  updateSession,
} from './store.js';

/**
 * Session manager class
 */
export class SessionManager {
  /**
   * Create a new session
   */
  async create(options?: {
    name?: string;
    workingDirectory?: string;
  }): Promise<string> {
    const sessionId = uuidv4();

    const session = {
      id: sessionId,
      name: options?.name || `session-${sessionId.slice(0, 8)}`,
      working_directory: options?.workingDirectory || os.homedir(),
      created_at: new Date().toISOString(),
      status: 'active' as const,
      environment: {
        PATH: process.env.PATH || '',
        SHELL: process.env.SHELL || '',
        HOME: process.env.HOME || '',
      },
    };

    await saveSession(session);
    return sessionId;
  }

  /**
   * Get session by ID
   */
  async get(sessionId: string) {
    return await getSession(sessionId);
  }

  /**
   * List all sessions
   */
  async list() {
    return await getSessions();
  }

  /**
   * Update session
   */
  async update(sessionId: string, updates: any) {
    await updateSession(sessionId, updates);
  }

  /**
   * Destroy session
   */
  async destroy(sessionId: string): Promise<void> {
    const session = await getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Update status before deleting
    await updateSession(sessionId, { status: 'destroyed' });
    await deleteSession(sessionId);
  }

  /**
   * Get session working directory
   */
  async getWorkingDirectory(sessionId: string): Promise<string> {
    const session = await getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return session.working_directory;
  }

  /**
   * Set session working directory
   */
  async setWorkingDirectory(
    sessionId: string,
    directory: string
  ): Promise<void> {
    await updateSession(sessionId, { working_directory: directory });
  }

  /**
   * Cleanup inactive sessions
   */
  async cleanupInactive(maxAge: number = 3600000): Promise<number> {
    const sessions = await getSessions();
    const now = Date.now();
    let cleaned = 0;

    for (const session of sessions) {
      const createdAt = new Date(session.created_at).getTime();
      const age = now - createdAt;

      if (age > maxAge && session.status === 'inactive') {
        await deleteSession(session.id);
        cleaned++;
      }
    }

    return cleaned;
  }
}

// Export singleton instance
export const sessionManager = new SessionManager();
