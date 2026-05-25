#!/usr/bin/env node
/**
 * Cube Sandbox Runner — 极简命令执行服务
 * 监听9531端口，接收命令执行请求，在受限环境中执行
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { execFile } from 'child_process';
import { randomUUID } from 'crypto';

const PORT = parseInt(process.env.SANDBOX_PORT || '9531');
const MAX_TIME = parseInt(process.env.MAX_EXECUTION_TIME || '60') * 1000;
const MAX_OUTPUT = parseInt(process.env.MAX_OUTPUT_SIZE || '1048576');
const ALLOWED = (process.env.ALLOWED_COMMANDS || '').split(',');

interface ExecRequest {
  command: string;
  args?: string[];
  cwd?: string;
  timeout?: number;
  stdin?: string;
}

interface ExecResponse {
  request_id: string;
  status: 'completed' | 'failed' | 'rejected';
  stdout: string;
  stderr: string;
  exit_code: number | null;
  duration_ms: number;
}

function isAllowed(cmd: string): boolean {
  const base = cmd.split('/')[0].split(' ').pop() || '';
  return ALLOWED.some(a => base === a.trim());
}

function handleExec(req: IncomingMessage, res: ServerResponse) {
  let body = '';
  req.on('data', (chunk: Buffer) => { body += chunk; });
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');

    let execReq: ExecRequest;
    try {
      execReq = JSON.parse(body);
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ status: 'rejected', error: 'Invalid JSON' }));
      return;
    }

    if (!execReq.command || !isAllowed(execReq.command)) {
      res.writeHead(403);
      res.end(JSON.stringify({
        request_id: randomUUID(),
        status: 'rejected',
        stdout: '',
        stderr: `Command not allowed: ${execReq.command}`,
        exit_code: null,
        duration_ms: 0,
      }));
      return;
    }

    const start = Date.now();
    const timeout = Math.min(execReq.timeout || MAX_TIME, MAX_TIME);
    const args = execReq.args || [];

    const child = execFile(execReq.command, args, {
      cwd: execReq.cwd || '/workspace',
      timeout,
      maxBuffer: MAX_OUTPUT,
      shell: false,
    }, (error, stdout, stderr) => {
      const result: ExecResponse = {
        request_id: randomUUID(),
        status: error ? 'failed' : 'completed',
        stdout: (stdout || '').slice(0, MAX_OUTPUT),
        stderr: (stderr || '').slice(0, MAX_OUTPUT),
        exit_code: error ? (error as any).code || 1 : 0,
        duration_ms: Date.now() - start,
      };
      res.writeHead(200);
      res.end(JSON.stringify(result));
    });

    if (execReq.stdin) {
      child.stdin?.write(execReq.stdin);
      child.stdin?.end();
    }
  });
}

const server = createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/exec') {
    handleExec(req, res);
  } else if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'healthy' }));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Cube Sandbox running on port ${PORT}`);
});
