import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
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
  AuthIssueRequest,
  AuthIssueResponse,
  AuthVerifyRequest,
  AuthVerifyResponse,
  NotifyApiRequest,
  NotifyApiResponse,
  RedZoneCheckRequest,
} from './types.js';
import { isKnownMember } from '../security/identity.js';
import { verifyMeetingToken, authorize } from '../tools/authorize.js';
import { sendNotification } from './notify.js';
import { check } from '../redzone_checker.js';

const DEFAULT_PORT = 9532;
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

export function startGatewayServer(port?: number): Promise<Server> {
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
      } else if (path === '/health' && method === 'GET') {
        sendJSON(res, 200, {
          status: 'ok',
          uptime: process.uptime(),
          pid: process.pid,
          timestamp: new Date().toISOString(),
        });
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
        const requiresAuth =
          category === 'red_zone' || category === 'authorizable';
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
        } else if (category === 'authorizable') {
          response.reason = `Command '${cmd.split(' ')[0]}' requires authorization (authorizable escape path)`;
        }
        sendJSON(res, blocked ? 403 : 200, response);
      } else if (path === '/v1/auth/issue' && method === 'POST') {
        const body = await readBody(req);
        let issueReq: AuthIssueRequest;
        try {
          issueReq = JSON.parse(body);
        } catch {
          sendError(res, 400, 'Invalid JSON');
          return;
        }
        if (!issueReq.caller || !isKnownMember(issueReq.caller)) {
          sendError(
            res,
            403,
            `caller '${issueReq.caller}' is not a registered member`
          );
          return;
        }
        if (!issueReq.agent_id) {
          sendError(res, 400, 'agent_id is required');
          return;
        }
        if (!issueReq.meeting_id) {
          sendError(res, 400, 'meeting_id is required');
          return;
        }
        const result = await authorize.handler({
          command: 'issue',
          caller: issueReq.caller,
          agent_id: issueReq.agent_id,
          meeting_id: issueReq.meeting_id,
          persistent: issueReq.persistent,
          max_usage: issueReq.max_usage,
        });
        const tokenData = JSON.parse(
          (result.content as Array<{ text: string }>)[0].text
        );
        const response: AuthIssueResponse = {
          auth_token: tokenData.auth_token,
          agent_id: tokenData.agent_id,
          meeting_id: tokenData.meeting_id,
          scope: tokenData.scope,
          expires_at: tokenData.expires_at,
          persistent: tokenData.persistent,
          max_usage: tokenData.max_usage,
          status: tokenData.status,
        };
        sendJSON(res, 201, response);
      } else if (path === '/v1/auth/verify' && method === 'POST') {
        const body = await readBody(req);
        let verifyReq: AuthVerifyRequest;
        try {
          verifyReq = JSON.parse(body);
        } catch {
          sendError(res, 400, 'Invalid JSON');
          return;
        }
        if (!verifyReq.auth_token) {
          sendError(res, 400, 'auth_token is required');
          return;
        }
        const result = verifyMeetingToken(
          verifyReq.auth_token,
          verifyReq.agent_id,
          verifyReq.meeting_id
        );
        const response: AuthVerifyResponse = result;
        sendJSON(res, result.valid ? 200 : 403, response);
      } else if (path === '/v1/notify' && method === 'POST') {
        const body = await readBody(req);
        let notifyReq: NotifyApiRequest;
        try {
          notifyReq = JSON.parse(body);
        } catch {
          sendError(res, 400, 'Invalid JSON');
          return;
        }
        if (!notifyReq.source || !isKnownMember(notifyReq.source)) {
          sendError(
            res,
            403,
            `source '${notifyReq.source}' is not a registered member`
          );
          return;
        }
        if (!notifyReq.target || typeof notifyReq.target !== 'string') {
          sendError(res, 400, 'target is required');
          return;
        }
        if (!notifyReq.message || typeof notifyReq.message !== 'string') {
          sendError(res, 400, 'message is required');
          return;
        }
        const sendResult = await sendNotification({
          target: notifyReq.target,
          message: notifyReq.message,
          priority: notifyReq.priority,
        });
        const response: NotifyApiResponse = sendResult;
        sendJSON(res, sendResult.sent ? 200 : 502, response);
      } else if (path === '/v1/redzone/check' && method === 'POST') {
        const body = await readBody(req);
        let checkReq: RedZoneCheckRequest;
        try {
          checkReq = JSON.parse(body);
        } catch {
          sendError(res, 400, 'Invalid JSON');
          return;
        }
        if (!checkReq.operation || typeof checkReq.operation !== 'string') {
          sendError(res, 400, 'operation is required');
          return;
        }
        if (!checkReq.caller || typeof checkReq.caller !== 'string') {
          sendError(res, 400, 'caller is required');
          return;
        }
        const response = await check(checkReq.operation, {
          caller: checkReq.caller,
          operation: checkReq.operation,
          meeting_id: checkReq.meeting_id,
          agent_id: checkReq.agent_id,
          target_agent: checkReq.target_agent,
          reason: checkReq.reason,
          timestamp: new Date().toISOString(),
        });
        const statusCode = response.decision === 'block' ? 403 : 200;
        sendJSON(res, statusCode, response);
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
      resolve(server);
    });
  });
}
