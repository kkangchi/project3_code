import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '.env') });

import { createServer } from 'http';
import next from 'next';
import { initSocketServer } from './lib/socket';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();
const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    // 1. [최상단 CORS 헤더 설정] 허용할 Origin 검증 및 CORS 헤더 주입
    const origin = req.headers.origin;
    const allowedOrigins = ['http://localhost:3001', 'http://localhost:3000'];

    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    }

    // 2. [OPTIONS Preflight 처리] 브라우저 Preflight 요청은 인증/라우터 진입 전 즉시 204 응답
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // 3. 그 외 실제 요청(GET, POST 등)만 Next.js 요청 핸들러로 전달
    handle(req, res);
  });

  // Socket.io 서버 초기화 및 HTTP 서버 바인딩
  initSocketServer(httpServer);

  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});