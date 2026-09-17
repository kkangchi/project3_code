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
    // 1. CORS 기본 헤더 설정
    const origin = req.headers.origin;
    const allowedOrigins = ['http://localhost:3001', 'http://localhost:3000'];

    if (origin && allowedOrigins.includes(origin as string)) {
      res.setHeader('Access-Control-Allow-Origin', origin as string);
    } else {
      res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3001');
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    // 2. OPTIONS Preflight 처리
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // 3. Socket.io 요청은 Next.js handle()로 넘기지 않고 우회
    if (req.url && req.url.startsWith('/socket.io')) {
      return;
    }

    // 4. 일반 요청만 Next.js 라우터 처리
    handle(req, res);
  });

  initSocketServer(httpServer);

  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});