import { request as httpRequest } from 'http';

export interface NotifyPayload {
  target: string;
  message: string;
  priority?: 'low' | 'normal' | 'high' | 'critical';
}

export interface NotifyResult {
  sent: boolean;
  error?: string;
}

const DEFAULT_NOTIFY_URL = 'http://127.0.0.1:8765';
const NOTIFY_TIMEOUT = 5000;

const SSE_PUSH_HOST = '127.0.0.1';
const SSE_PUSH_PORT = 9527;
const SSE_PUSH_TIMEOUT = 3000;

interface ProposalPayload {
  type: 'governance_proposal';
  proposal_id: string;
  proposer: string;
  list_type: string;
  action: string;
  entries: string[];
  reason: string;
  expires_at: string;
}

export function broadcastProposal(
  proposal: ProposalPayload,
  port?: number
): void {
  const body = JSON.stringify({
    event: 'governance_proposal',
    recipient: 'all',
    subject: 'Governance: 新提案待审批',
    ...proposal,
  });

  const req = httpRequest(
    {
      hostname: SSE_PUSH_HOST,
      port: port ?? SSE_PUSH_PORT,
      path: '/internal/broadcast',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: SSE_PUSH_TIMEOUT,
    },
    () => {
      // fire-and-forget
    }
  );

  req.on('error', () => {
    // silent — SSE push server may not be running
  });

  req.on('timeout', () => {
    req.destroy();
  });

  req.write(body);
  req.end();
}

export function sendNotification(
  payload: NotifyPayload,
  baseUrl?: string
): Promise<NotifyResult> {
  const url = new URL('/api/notify', baseUrl || DEFAULT_NOTIFY_URL);

  return new Promise((resolve) => {
    const body = JSON.stringify({
      target: payload.target,
      message: payload.message,
      priority: payload.priority || 'normal',
    });

    const req = httpRequest(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: NOTIFY_TIMEOUT,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ sent: true });
          } else {
            resolve({
              sent: false,
              error: `HTTP ${res.statusCode}: ${data}`,
            });
          }
        });
      }
    );

    req.on('error', (err) => {
      resolve({ sent: false, error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ sent: false, error: 'Request timed out' });
    });

    req.write(body);
    req.end();
  });
}
