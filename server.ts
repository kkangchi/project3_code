import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '.env') });

import { createServer } from 'http';
import next from 'next';
import { initSocketServer } from './lib/socket';

const dev = process.env.NODE_ENV !== 'production';

const app = next({
  dev,
  hostname: '0.0.0.0',
  port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
});
const handle = app.getRequestHandler();
const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const origin = req.headers.origin;

    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
      : ['http://localhost:3000', 'http://localhost:3001'];

    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigins[0] || 'http://localhost:3000');
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // ⭐ 핵심 수정: /socket.io 요청은 Next.js로 넘기지 않고
    // Socket.io 엔진이 자체 리스너로 처리하도록 그냥 리턴
    if (req.url && req.url.startsWith('/socket.io')) {
      return;
    }

    handle(req, res);
  });

  initSocketServer(httpServer);

  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});