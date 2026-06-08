/**
 * List Governance MCP Tool (consolidated)
 *
 * Replaces: propose_list_change, review_list_change, list_list_changes
 * Usage: governance { command: "propose"|"review"|"list", ... }
 */

import {
  createProposal,
  resolveProposal,
  listProposals,
  getProposal,
  getImmutableBlacklist,
  snapshotLists,
} from '../security/list_governance.js';
import { isKnownMember } from '../security/identity.js';

function json(data: unknown) {
  return JSON.stringify(data, null, 2);
}

export const governance = {
  definition: {
    name: 'governance',
    description:
      'Manage safe-bash command list changes with dual-sign. Commands: propose (create proposal), review (approve/reject), list (list proposals + current lists).',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          enum: ['propose', 'review', 'list'],
          description: 'Governance operation to perform',
        },
        proposer: {
          type: 'string',
          description:
            "Identity of the proposer (required for 'propose', filter for 'list')",
        },
        list_type: {
          type: 'string',
          enum: ['whitelist', 'blacklist', 'red_zone'],
          description: "Which list to modify (required for 'propose')",
        },
        action: {
          type: 'string',
          enum: ['add', 'remove'],
          description: "Add or remove entries (required for 'propose')",
        },
        entries: {
          type: 'array',
          items: { type: 'string' },
          description: "Command names (required for 'propose', max 20)",
        },
        reason: {
          type: 'string',
          description: "Justification (required for 'propose', min 10 chars)",
        },
        proposal_id: {
          type: 'string',
          description: "Proposal ID (required for 'review')",
        },
        reviewer: {
          type: 'string',
          description: "Reviewer identity (required for 'review')",
        },
        decision: {
          type: 'string',
          enum: ['approve', 'reject'],
          description: "Review decision (required for 'review')",
        },
        status: {
          type: 'string',
          enum: [
            'pending',
            'approved',
            'rejected',
            'applied',
            'failed',
            'expired',
          ],
          description: "Filter by status (optional, for 'list')",
        },
      },
      required: ['command'],
    },
  },

  async handler(args: unknown) {
    const {
      command,
      proposer,
      list_type,
      action,
      entries,
      reason,
      proposal_id,
      reviewer,
      decision,
      status,
    } = args as {
      command: string;
      proposer?: string;
      list_type?: string;
      action?: string;
      entries?: string[];
      reason?: string;
      proposal_id?: string;
      reviewer?: string;
      decision?: 'approve' | 'reject';
      status?: string;
    };

    switch (command) {
      case 'propose': {
        if (
          !proposer ||
          typeof proposer !== 'string' ||
          !isKnownMember(proposer)
        ) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error: '${proposer}' is not a registered 灵族 member`,
              },
            ],
            isError: true,
          };
        }

        if (
          !list_type ||
          !['whitelist', 'blacklist', 'red_zone'].includes(list_type)
        ) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error: invalid list_type '${list_type}'. Valid: whitelist, blacklist, red_zone`,
              },
            ],
            isError: true,
          };
        }

        const result = createProposal(
          proposer,
          list_type as 'whitelist' | 'blacklist' | 'red_zone',
          (action || 'add') as 'add' | 'remove',
          entries || [],
          reason || ''
        );

        if (result.error) {
          return {
            content: [
              { type: 'text' as const, text: `Error: ${result.error}` },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: json({
                ...result.proposal,
                message: `Proposal created (id: ${result.proposal!.id}). A DIFFERENT member must call governance review to approve. Proposer cannot self-approve.`,
                immutable_blacklist: getImmutableBlacklist(),
                current_lists: snapshotLists(),
              }),
            },
          ],
        };
      }

      case 'review': {
        if (
          !reviewer ||
          typeof reviewer !== 'string' ||
          !isKnownMember(reviewer)
        ) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error: '${reviewer}' is not a registered 灵族 member`,
              },
            ],
            isError: true,
          };
        }

        if (!proposal_id || typeof proposal_id !== 'string') {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: proposal_id is required',
              },
            ],
            isError: true,
          };
        }

        const before = getProposal(proposal_id);
        if (!before) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error: proposal '${proposal_id}' not found`,
              },
            ],
            isError: true,
          };
        }

        const result = resolveProposal(
          proposal_id,
          reviewer,
          decision || 'reject',
          reason
        );

        if (result.error) {
          return {
            content: [
              { type: 'text' as const, text: `Error: ${result.error}` },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: json({
                proposal: result.proposal,
                reviewed_proposal: {
                  proposer: before.proposer,
                  list_type: before.list_type,
                  action: before.action,
                  entries: before.entries,
                  reason: before.reason,
                },
                current_lists: snapshotLists(),
                message:
                  result.proposal!.status === 'applied'
                    ? 'Change applied successfully. Runtime lists updated.'
                    : result.proposal!.status === 'rejected'
                      ? 'Proposal rejected. No changes made.'
                      : `Proposal status: ${result.proposal!.status}`,
              }),
            },
          ],
        };
      }

      case 'list': {
        const proposals = listProposals({
          status: status as Parameters<typeof listProposals>[0] extends infer T
            ? T extends { status?: infer S }
              ? S
              : never
            : never,
          proposer,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: json({
                total: proposals.length,
                proposals: proposals.map((p) => ({
                  id: p.id,
                  proposer: p.proposer,
                  list_type: p.list_type,
                  action: p.action,
                  entries: p.entries,
                  reason: p.reason,
                  status: p.status,
                  approved_by: p.approved_by,
                  rejected_by: p.rejected_by,
                  created_at: p.created_at,
                })),
                immutable_blacklist: getImmutableBlacklist(),
                current_lists: snapshotLists(),
              }),
            },
          ],
        };
      }

      default:
        throw new Error(
          `Unknown governance command: '${command}'. Valid: propose, review, list`
        );
    }
  },
};
