/**
 * Session Store
 * Manages terminal session persistence
 */

import * as fs from 'fs/promises';
import * as path from 'path';

const MAX_HISTORY_PER_SESSION = 100;

export interface Session {
  id: string;
  name: string;
  working_directory: string;
  created_at: string;
  status: 'active' | 'inactive' | 'destroyed';
  environment?: Record<string, string>;
  command_history?: string[];
}

// In-memory session cache
let sessions: Map<string, Session> = new Map();

// Data file path
const DATA_FILE = path.join(process.cwd(), '.ling-term-mcp', 'sessions.json');

/**
 * Initialize session store
 */
async function initializeStore(): Promise<void> {
  try {
    const dataDir = path.dirname(DATA_FILE);
    await fs.mkdir(dataDir, { recursive: true });

    const data = await fs.readFile(DATA_FILE, 'utf-8');
    const sessionsArray = JSON.parse(data) as Session[];
    sessions = new Map(sessionsArray.map((s) => [s.id, s]));
  } catch (error) {
    sessions = new Map();
  }
}

/**
 * Save sessions to disk
 */
async function persistSessions(): Promise<void> {
  const sessionsArray = Array.from(sessions.values());
  const dataDir = path.dirname(DATA_FILE);
  await fs.mkdir(dataDir, { recursive: true });
  const data = JSON.stringify(sessionsArray, null, 2);
  await fs.writeFile(DATA_FILE, data, { mode: 0o600 });
}

/**
 * Save a session
 */
export async function saveSession(session: Session): Promise<void> {
  await initializeStore();
  sessions.set(session.id, session);
  await persistSessions();
}

/**
 * Get a session by ID
 */
export async function getSession(id: string): Promise<Session | undefined> {
  await initializeStore();
  return sessions.get(id);
}

/**
 * Get all sessions
 */
export async function getSessions(): Promise<Session[]> {
  await initializeStore();
  return Array.from(sessions.values());
}

/**
 * Update a session
 */
export async function updateSession(
  id: string,
  updates: Partial<Session>
): Promise<void> {
  await initializeStore();
  const session = sessions.get(id);
  if (session) {
    const updatedSession = { ...session, ...updates };
    sessions.set(id, updatedSession);
    await persistSessions();
  }
}

/**
 * Append a command to session history
 */
export async function appendCommandHistory(
  id: string,
  command: string
): Promise<void> {
  await initializeStore();
  const session = sessions.get(id);
  if (session) {
    const history = session.command_history || [];
    history.push(command);
    if (history.length > MAX_HISTORY_PER_SESSION) {
      history.splice(0, history.length - MAX_HISTORY_PER_SESSION);
    }
    session.command_history = history;
    sessions.set(id, session);
    await persistSessions();
  }
}

/**
 * Delete a session
 */
export async function deleteSession(id: string): Promise<void> {
  await initializeStore();
  sessions.delete(id);
  await persistSessions();
}

/**
 * Clear all sessions
 */
export async function clearSessions(): Promise<void> {
  sessions = new Map();
  await persistSessions();
}
