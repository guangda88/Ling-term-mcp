/**
 * Session Store
 * Manages terminal session persistence
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  DecisionRecord,
  BehavioralViolation,
  SessionSnapshot,
} from '@ling/protocol';
import { checkBehavioralContracts } from '../audit/contracts.js';
import { generateSnapshot } from '../audit/snapshot.js';

const MAX_HISTORY_PER_SESSION = 100;
const MAX_DECISIONS_PER_SESSION = 200;

export interface Session {
  id: string;
  name: string;
  working_directory: string;
  created_at: string;
  status: 'active' | 'inactive' | 'destroyed';
  owner?: string;
  environment?: Record<string, string>;
  command_history?: string[];
  decision_log?: DecisionRecord[];
  behavioral_violations?: BehavioralViolation[];
  snapshot?: SessionSnapshot;
}

let sessions: Map<string, Session> = new Map();
let initialized = false;

const DATA_DIR = path.join(process.cwd(), '.ling-term-mcp');
const DATA_FILE = path.join(DATA_DIR, 'sessions.json');

/**
 * Initialize session store (lazy, runs once)
 */
async function initializeStore(): Promise<void> {
  if (initialized) return;
  initialized = true;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const data = await fs.readFile(DATA_FILE, 'utf-8');
    const sessionsArray = JSON.parse(data) as Session[];
    sessions = new Map(sessionsArray.map((s) => [s.id, s]));
  } catch {
    sessions = new Map();
  }
}

/**
 * Save sessions to disk
 */
async function persistSessions(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const data = JSON.stringify(Array.from(sessions.values()), null, 2);
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
 * Append a decision record and check behavioral contracts
 */
export async function appendDecisionRecord(
  id: string,
  record: DecisionRecord
): Promise<BehavioralViolation[]> {
  await initializeStore();
  const session = sessions.get(id);
  if (!session) return [];

  const log = session.decision_log || [];
  log.push(record);
  if (log.length > MAX_DECISIONS_PER_SESSION) {
    log.splice(0, log.length - MAX_DECISIONS_PER_SESSION);
  }
  session.decision_log = log;

  const violations = checkBehavioralContracts(record, log.slice(0, -1));
  if (violations.length > 0) {
    const existing = session.behavioral_violations || [];
    session.behavioral_violations = [...existing, ...violations];
  }

  sessions.set(id, session);
  await persistSessions();
  return violations;
}

/**
 * Generate and store session snapshot, then mark session destroyed
 */
export async function finalizeSession(
  id: string
): Promise<SessionSnapshot | null> {
  await initializeStore();
  const session = sessions.get(id);
  if (!session) return null;

  const snapshot = generateSnapshot(
    session.id,
    session.name,
    session.created_at,
    session.decision_log || [],
    session.behavioral_violations || []
  );

  session.snapshot = snapshot;
  session.status = 'destroyed';
  sessions.set(id, session);
  await persistSessions();
  return snapshot;
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
