/**
 * List Governance — safe-bash blacklist/whitelist dual-sign control
 *
 * Flow: propose → audit → approve → apply
 *
 * Rule (user-approved option C):
 *   - Any member can PROPOSE a list change
 *   - The proposer CANNOT approve their own proposal
 *   - Requires approval from a DIFFERENT member (dual-sign)
 *   - Only after dual-sign, the change is applied to runtime lists
 *   - All actions are recorded in LingBus alert channel (via log_operation)
 */

import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { isKnownMember } from './identity.js';
import { applyListChange, getEffectiveLists } from './validator.js';

// BUS-02: Persist proposals to JSONL so they survive process restarts
const PROPOSAL_LOG_DIR =
  process.env.LING_TERM_BASEDIR || path.join(os.homedir(), '.ling-term-mcp');
const PROPOSAL_LOG_FILE = path.join(PROPOSAL_LOG_DIR, 'proposals.jsonl');

function persistProposal(p: ListProposal): void {
  try {
    if (!fs.existsSync(PROPOSAL_LOG_DIR)) {
      fs.mkdirSync(PROPOSAL_LOG_DIR, { recursive: true });
    }
    fs.appendFileSync(PROPOSAL_LOG_FILE, JSON.stringify(p) + '\n', 'utf8');
  } catch {
    // Non-fatal: persistence must never block governance flow
  }
}

export type ListType = 'whitelist' | 'blacklist' | 'authorizable' | 'red_zone';
export type ListAction = 'add' | 'remove';

export type ProposalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'applied'
  | 'failed'
  | 'expired';

export interface ListProposal {
  id: string;
  proposer: string;
  list_type: ListType;
  action: ListAction;
  entries: string[];
  reason: string;
  created_at: string;
  expires_at: string;
  status: ProposalStatus;
  approved_by?: string;
  approved_at?: string;
  rejected_by?: string;
  rejected_at?: string;
  reject_reason?: string;
  applied_at?: string;
  apply_error?: string;
}

const proposals = new Map<string, ListProposal>();
const PROPOSAL_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_PROPOSALS = 50;

/**
 * Read-only list of protected entries that cannot be removed.
 * These are the most dangerous commands and must never be un-blacklisted.
 */
export const IMMUTABLE_BLACKLIST = new Set<string>([
  'rm',
  'dd',
  'mkfs',
  'shutdown',
  'reboot',
  'halt',
  'poweroff',
  'sudo',
  'su',
  'chmod',
  'chown',
  'iptables',
  'fdisk',
]);

function cleanup(): void {
  const now = Date.now();
  for (const [, p] of proposals) {
    if (p.status === 'pending' && now > new Date(p.expires_at).getTime()) {
      p.status = 'expired';
    }
  }
  if (proposals.size > MAX_PROPOSALS) {
    const sorted = [...proposals.entries()].sort(
      ([, a], [, b]) => +new Date(a.created_at) - +new Date(b.created_at)
    );
    for (const [id, p] of sorted) {
      if (p.status !== 'pending') proposals.delete(id);
      if (proposals.size <= MAX_PROPOSALS) break;
    }
  }
}

/**
 * Validate that entries are sane (not empty, no shell metachars, reasonable length).
 */
function validateEntries(entries: string[]): string | null {
  if (!entries || entries.length === 0) {
    return 'entries array cannot be empty';
  }
  if (entries.length > 20) {
    return 'cannot modify more than 20 entries per proposal';
  }
  for (const entry of entries) {
    if (typeof entry !== 'string' || entry.length === 0) {
      return 'entries must be non-empty strings';
    }
    if (entry.length > 100) {
      return `entry '${entry.slice(0, 20)}...' is too long (max 100 chars)`;
    }
    if (/[;&|`$()<>{}\s]/.test(entry)) {
      return `entry '${entry}' contains forbidden shell metacharacters`;
    }
  }
  return null;
}

/**
 * Check if a proposed removal is blocked by the immutable set.
 */
function checkImmutable(
  _listType: ListType,
  action: ListAction,
  entries: string[]
): string | null {
  if (action === 'remove') {
    const blocked = entries.filter((e) => IMMUTABLE_BLACKLIST.has(e));
    if (blocked.length > 0) {
      return `Cannot remove immutable entries: ${blocked.join(', ')}. These commands are permanently protected.`;
    }
  }
  return null;
}

// === Public API (used by MCP tools) ===

export function createProposal(
  proposer: string,
  listType: ListType,
  action: ListAction,
  entries: string[],
  reason: string
): { proposal?: ListProposal; error?: string } {
  if (!proposer || !isKnownMember(proposer)) {
    return { error: `'${proposer}' is not a registered 灵族 member` };
  }
  if (!reason || reason.trim().length < 10) {
    return { error: 'reason is required and must be at least 10 characters' };
  }

  const entryError = validateEntries(entries);
  if (entryError) return { error: entryError };

  const immutableError = checkImmutable(listType, action, entries);
  if (immutableError) return { error: immutableError };

  // Validate list_type
  if (
    !['whitelist', 'blacklist', 'authorizable', 'red_zone'].includes(listType)
  ) {
    return { error: `invalid list_type: '${listType}'` };
  }
  if (!['add', 'remove'].includes(action)) {
    return { error: `invalid action: '${action}'` };
  }

  cleanup();

  const now = new Date();
  const id = randomUUID();
  const proposal: ListProposal = {
    id,
    proposer,
    list_type: listType,
    action,
    entries: [...entries],
    reason,
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + PROPOSAL_TTL_MS).toISOString(),
    status: 'pending',
  };
  proposals.set(id, proposal);
  persistProposal(proposal);

  return { proposal };
}

export function resolveProposal(
  proposalId: string,
  approver: string,
  decision: 'approve' | 'reject',
  rejectReason?: string
): { proposal?: ListProposal; error?: string } {
  if (!approver || !isKnownMember(approver)) {
    return { error: `'${approver}' is not a registered 灵族 member` };
  }

  const p = proposals.get(proposalId);
  if (!p) {
    return { error: `proposal '${proposalId}' not found` };
  }

  if (p.status !== 'pending') {
    return {
      error: `proposal is already ${p.status} (by ${p.approved_by || p.rejected_by || 'system'})`,
    };
  }

  // Check expiry
  const now = Date.now();
  if (now > new Date(p.expires_at).getTime()) {
    p.status = 'expired';
    return { error: `proposal has expired` };
  }

  // === Dual-sign rule: proposer cannot approve their own proposal ===
  if (p.proposer === approver) {
    return {
      error: `Dual-sign rule: proposer '${approver}' cannot approve their own proposal. A different member must review.`,
    };
  }

  const nowIso = new Date().toISOString();

  if (decision === 'reject') {
    p.status = 'rejected';
    p.rejected_by = approver;
    p.rejected_at = nowIso;
    p.reject_reason = rejectReason || 'No reason provided';
    persistProposal(p);
    return { proposal: p };
  }

  // Approve → apply the change
  p.status = 'approved';
  p.approved_by = approver;
  p.approved_at = nowIso;

  try {
    applyListChange(p.list_type, p.action, p.entries);
    p.status = 'applied';
    p.applied_at = new Date().toISOString();
  } catch (err) {
    p.status = 'failed';
    p.apply_error = err instanceof Error ? err.message : String(err);
  }

  persistProposal(p);
  return { proposal: p };
}

export function listProposals(filter?: {
  status?: ProposalStatus;
  proposer?: string;
}): ListProposal[] {
  cleanup();
  let results = [...proposals.values()];
  if (filter?.status) {
    results = results.filter((p) => p.status === filter.status);
  }
  if (filter?.proposer) {
    results = results.filter((p) => p.proposer === filter.proposer);
  }
  results.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  return results;
}

export function getProposal(id: string): ListProposal | undefined {
  const p = proposals.get(id);
  if (p && p.status === 'pending') {
    const now = Date.now();
    if (now > new Date(p.expires_at).getTime()) {
      p.status = 'expired';
    }
  }
  return p;
}

export function getImmutableBlacklist(): string[] {
  return [...IMMUTABLE_BLACKLIST].sort();
}

export function snapshotLists() {
  return getEffectiveLists();
}

export function _resetForTesting(): void {
  proposals.clear();
}
