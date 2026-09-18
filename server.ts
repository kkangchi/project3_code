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
    
    // .env의 ALLOWED_ORIGINS 가져오기
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
      : ['http://localhost:3000', 'http://localhost:3001'];

    // 1. Dynamic CORS 헤더 처리
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigins[0] || 'http://localhost:3000');
    }

    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    // 2. Preflight(OPTIONS) 요청 즉시 응답
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // 3. 요청을 Next.js 핸들러로 전달 (Socket.io Engine이 HTTP 서버 레벨에서 가로채어 처리함)
    handle(req, res);
  });

  // Socket.io 서버 초기화 및 HTTP 서버 바인딩
  initSocketServer(httpServer);

  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});