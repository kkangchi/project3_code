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
    const allowedOrigins = ['http://localhost:3000', 'http://localhost:3001'];

    if (origin && allowedOrigins.includes(origin as string)) {
      res.setHeader('Access-Control-Allow-Origin', origin as string);
    } else if (origin) {
      // 요청받은 Origin이 허용 목록에 없더라도 요청한 origin을 그대로 반영하거나 지정
      res.setHeader('Access-Control-Allow-Origin', origin as string);
    } else {
      res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
    }

    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    // 2. OPTIONS Preflight 빠른 응답
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // 3. Socket.io 요청 경로 분기 (CORS 헤더가 적용된 후 Socket.io로 넘어가도록 처리)
    if (req.url && req.url.startsWith('/socket.io')) {
      return;
    }

    // 4. 일반 웹 요청만 Next.js 라우터로 전달
    handle(req, res);
  });

  // Socket.io 서버 초기화
  initSocketServer(httpServer);

  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});