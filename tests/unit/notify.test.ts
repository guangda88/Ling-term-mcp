import { sendNotification } from '../../src/gateway/notify';
import { createServer, Server } from 'http';

describe('sendNotification', () => {
  let server: Server;
  let receivedBody: Record<string, unknown> | null = null;
  let serverPort: number;

  beforeAll((done) => {
    server = createServer((req, res) => {
      let data = '';
      req.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });
      req.on('end', () => {
        if (req.url === '/api/notify' && req.method === 'POST') {
          try {
            receivedBody = JSON.parse(data);
          } catch {
            receivedBody = null;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        serverPort = addr.port;
      }
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  beforeEach(() => {
    receivedBody = null;
  });

  it('should send notification with required fields', async () => {
    const result = await sendNotification(
      { target: 'lingxi', message: 'test notification' },
      `http://127.0.0.1:${serverPort}`
    );
    expect(result.sent).toBe(true);
    expect(receivedBody).toBeTruthy();
    expect(receivedBody!.target).toBe('lingxi');
    expect(receivedBody!.message).toBe('test notification');
  });

  it('should default priority to normal', async () => {
    await sendNotification(
      { target: 'lingxi', message: 'test' },
      `http://127.0.0.1:${serverPort}`
    );
    expect(receivedBody!.priority).toBe('normal');
  });

  it('should send custom priority', async () => {
    await sendNotification(
      { target: 'lingxi', message: 'urgent', priority: 'critical' },
      `http://127.0.0.1:${serverPort}`
    );
    expect(receivedBody!.priority).toBe('critical');
  });

  it('should return error on connection refused', async () => {
    const result = await sendNotification(
      { target: 'lingxi', message: 'test' },
      'http://127.0.0.1:1'
    );
    expect(result.sent).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('should return error on server error response', async () => {
    const errorServer = createServer((_req, res) => {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    });
    await new Promise<void>((resolve) => {
      errorServer.listen(0, '127.0.0.1', resolve);
    });
    const addr = errorServer.address();
    const port = addr && typeof addr === 'object' ? addr.port : 0;

    const result = await sendNotification(
      { target: 'lingxi', message: 'test' },
      `http://127.0.0.1:${port}`
    );
    expect(result.sent).toBe(false);
    expect(result.error).toContain('HTTP 500');

    await new Promise<void>((resolve) => {
      errorServer.close(() => resolve());
    });
  });
});
