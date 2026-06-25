/**
 * Simple MCP HTTP Client
 *
 * Calls MCP tools on remote HTTP MCP servers.
 * Supports both direct HTTP POST and SSE-with-session transport.
 */

import * as http from 'http';
import * as https from 'https';

interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: string;
  id: string | number;
  result?: unknown;
  error?: JsonRpcError;
}

/**
 * Call a tool on an MCP HTTP server.
 *
 * @param url     Server URL (e.g. http://127.0.0.1:9528/mcp)
 * @param tool    Tool name to call
 * @param args    Tool arguments
 * @returns       Tool result content array
 */
export async function callMcpTool(
  url: string,
  tool: string,
  args: Record<string, unknown>
): Promise<Array<{ type: string; text?: string }>> {
  const urlObj = new URL(url);
  const isHttps = urlObj.protocol === 'https:';
  const port = parseInt(urlObj.port, 10) || (isHttps ? 443 : 80);

  // Step 1: GET to acquire session ID (required for SSE-based servers)
  const sessionId = await acquireSession(
    urlObj.hostname,
    port,
    urlObj.pathname,
    isHttps
  );

  // Step 2: POST JSON-RPC call
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: tool, arguments: args },
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body).toString(),
    Accept: 'application/json, text/event-stream',
  };

  if (sessionId) {
    headers['mcp-session-id'] = sessionId;
  }

  return new Promise((resolve, reject) => {
    const opts: http.RequestOptions = {
      hostname: urlObj.hostname,
      port,
      path: urlObj.pathname,
      method: 'POST',
      headers,
      timeout: 30_000,
    };

    const lib = isHttps ? https : http;
    const req = lib.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => {
        data += chunk.toString('utf-8');
      });
      res.on('end', () => {
        try {
          const result = parseSseResponse(data);
          if (result.error) {
            reject(
              new Error(
                `MCP error (${result.error.code}): ${result.error.message}`
              )
            );
            return;
          }
          const content =
            (
              result.result as {
                content?: Array<{ type: string; text?: string }>;
              }
            )?.content ?? [];
          resolve(content);
        } catch (err) {
          reject(
            err instanceof Error
              ? err
              : new Error(`Parse error: ${String(err)}`)
          );
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('MCP call timed out'));
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Acquire session ID via initialize handshake.
 * Sends POST initialize, then notifications/initialized.
 * Returns the mcp-session-id header for subsequent requests.
 */
async function acquireSession(
  hostname: string,
  port: number,
  path: string,
  isHttps: boolean
): Promise<string | null> {
  const initBody = JSON.stringify({
    jsonrpc: '2.0',
    id: 0,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'ling-term-mcp', version: '1.4.0' },
    },
  });

  return new Promise((resolve) => {
    const opts: http.RequestOptions = {
      hostname,
      port,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(initBody).toString(),
        Accept: 'application/json, text/event-stream',
      },
      timeout: 5_000,
    };

    const lib = isHttps ? https : http;
    const req = lib.request(opts, (res) => {
      const sid = res.headers['mcp-session-id'] as string | undefined;
      res.destroy();
      if (sid) {
        sendNotification(
          hostname,
          port,
          path,
          isHttps,
          sid,
          'notifications/initialized'
        );
      }
      resolve(sid || null);
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.write(initBody);
    req.end();
  });
}

/**
 * Send a fire-and-forget notification to a session.
 */
function sendNotification(
  hostname: string,
  port: number,
  path: string,
  isHttps: boolean,
  sessionId: string,
  method: string
): void {
  const body = JSON.stringify({ jsonrpc: '2.0', method, params: {} });
  const opts: http.RequestOptions = {
    hostname,
    port,
    path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body).toString(),
      Accept: 'application/json, text/event-stream',
      'mcp-session-id': sessionId,
    },
    timeout: 3_000,
  };

  const lib = isHttps ? https : http;
  const req = lib.request(opts);
  req.on('error', () => {});
  req.write(body);
  req.end();
}

/**
 * Parse SSE-encoded MCP response (event: message\ndata: {...}).
 * Also handles plain JSON responses.
 */
function parseSseResponse(raw: string): JsonRpcResponse {
  const trimmed = raw.trim();

  // Plain JSON
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed);
  }

  // SSE format: extract data field
  const dataMatch = trimmed.match(/^data:\s*(.*)$/m);
  if (dataMatch) {
    return JSON.parse(dataMatch[1]);
  }

  // Try to find JSON anywhere in the response
  const jsonMatch = trimmed.match(/\{.*\}/s);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }

  throw new Error(`Cannot parse MCP response: ${trimmed.slice(0, 200)}`);
}

/**
 * List available tools on a remote MCP server.
 */
export async function listMcpTools(
  url: string
): Promise<Array<{ name: string; description?: string }>> {
  const urlObj = new URL(url);
  const isHttps = urlObj.protocol === 'https:';
  const port = parseInt(urlObj.port, 10) || (isHttps ? 443 : 80);

  const sessionId = await acquireSession(
    urlObj.hostname,
    port,
    urlObj.pathname,
    isHttps
  );

  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {},
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body).toString(),
    Accept: 'application/json, text/event-stream',
  };

  if (sessionId) {
    headers['mcp-session-id'] = sessionId;
  }

  return new Promise((resolve, reject) => {
    const opts: http.RequestOptions = {
      hostname: urlObj.hostname,
      port,
      path: urlObj.pathname,
      method: 'POST',
      headers,
      timeout: 10_000,
    };

    const lib = isHttps ? https : http;
    const req = lib.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => {
        data += chunk.toString('utf-8');
      });
      res.on('end', () => {
        try {
          const result = parseSseResponse(data);
          if (result.error) {
            reject(
              new Error(
                `MCP error (${result.error.code}): ${result.error.message}`
              )
            );
            return;
          }
          resolve(
            (
              result.result as {
                tools?: Array<{ name: string; description?: string }>;
              }
            )?.tools ?? []
          );
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
