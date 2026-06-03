import { createServer, IncomingMessage, ServerResponse } from 'http';
import { Coordinator } from './coordinator.js';
import { securityValidator } from '../security/validator.js';
import type {
  DispatchRequest,
  DispatchResponse,
  CancelRequest,
  CancelResponse,
  GatewayStatus,
  HistoryResponse,
  CheckRequest,
  CheckResponse,
} from './types.js';

const DEFAULT_PORT = 9530;
const MAX_BODY_SIZE = 1024 * 1024;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      data += chunk.toString();
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function sendJSON(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendError(res: ServerResponse, status: number, message: string) {
  sendJSON(res, status, { error: message });
}

export function startGatewayServer(port?: number): Promise<void> {
  const actualPort =
    port || parseInt(process.env.LING_GATEWAY_PORT || '', 10) || DEFAULT_PORT;
  const coordinator = new Coordinator();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${actualPort}`);
    const path = url.pathname;
    const method = req.method || 'GET';

    try {
      if (path === '/api/gateway/dispatch' && method === 'POST') {
        const body = await readBody(req);
        let request: DispatchRequest;
        try {
          request = JSON.parse(body);
        } catch {
          sendError(res, 400, 'Invalid JSON');
          return;
        }
        const result: DispatchResponse = await coordinator.dispatch(request);
        const status = result.status === 'rejected' ? 403 : 200;
        sendJSON(res, status, result);
      } else if (path === '/api/gateway/status' && method === 'GET') {
        const status: GatewayStatus = coordinator.getStatus();
        sendJSON(res, 200, status);
      } else if (path === '/api/gateway/cancel' && method === 'POST') {
        const body = await readBody(req);
        let cancelReq: CancelRequest;
        try {
          cancelReq = JSON.parse(body);
        } catch {
          sendError(res, 400, 'Invalid JSON');
          return;
        }
        const result: CancelResponse = coordinator.cancel(
          cancelReq.request_id,
          cancelReq.source
        );
        sendJSON(res, result.cancelled ? 200 : 404, result);
      } else if (path === '/api/gateway/history' && method === 'GET') {
        const limitStr = url.searchParams.get('limit');
        const limit = limitStr ? parseInt(limitStr, 10) : 50;
        const result: HistoryResponse = {
          commands: coordinator.getHistory(limit),
        };
        sendJSON(res, 200, result);
      } else if (path === '/v1/check' && method === 'POST') {
        const body = await readBody(req);
        let checkReq: CheckRequest;
        try {
          checkReq = JSON.parse(body);
        } catch {
          sendError(res, 400, 'Invalid JSON');
          return;
        }
        if (!checkReq.command || typeof checkReq.command !== 'string') {
          sendError(res, 400, 'command is required');
          return;
        }
        const cmd = checkReq.command;
        const category = securityValidator.categorize(cmd);
        const blocked = category === 'blacklisted';
        const requiresAuth = category === 'red_zone' || blocked;
        const response: CheckResponse = {
          command: cmd,
          category,
          blocked,
          requires_authorization: requiresAuth,
          source: checkReq.source,
        };
        if (blocked) {
          response.reason = `Command '${cmd.split(' ')[0]}' is blacklisted`;
        } else if (category === 'red_zone') {
          response.reason = `Command '${cmd.split(' ')[0]}' is red-zone, requires authorization`;
        }
        sendJSON(res, blocked ? 403 : 200, response);
      } else {
        sendError(res, 404, 'Not found');
      }
    } catch (error) {
      console.error('[gateway] Request error:', error);
      sendError(res, 500, 'Internal server error');
    }
  });

  return new Promise((resolve) => {
    server.listen(actualPort, '127.0.0.1', () => {
      console.error(
        `[gateway] Command execution gateway listening on 127.0.0.1:${actualPort}`
      );
      resolve();
    });
  });
}
