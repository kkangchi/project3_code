import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '.env') });

import { createServer } from 'http';
import next from 'next';
import { initSocketServer } from './lib/socket';

const dev = process.env.NODE_ENV !== 'production';

const app = next({ dev, hostname: '0.0.0.0', port: process.env.PORT ? parseInt(process.env.PORT) : 3000 });
const handle = app.getRequestHandler();
const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    // 1. ALB(Proxy) 헤더 보정
    if (req.headers['x-forwarded-proto']) {
      req.headers['x-forwarded-proto'] = 'https';
    }
    if (req.headers['x-forwarded-host']) {
      req.headers['host'] = req.headers['x-forwarded-host'] as string;
    }

    // 2. CORS 헤더 설정
    const origin = req.headers.origin;
    const allowedOrigins = ['http://localhost:3001', 'http://localhost:3000'];

    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    } else {
      res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3001');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    }

    // 3. OPTIONS Preflight 처리
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // 4. [핵심] Socket.io 요청은 Next.js 핸들러(308 리다이렉트 발생 주범)로 안 넘어가게 바로 종료
    if (req.url && req.url.startsWith('/socket.io')) {
      return;
    }

    // 5. 일반 REST API 및 Next.js 페이지 요청만 전달
    handle(req, res);
  });

  // Socket.io 및 Engine.IO 경로 정규화 (가장 앞순위 실행)
  httpServer.prependListener('request', (req, _res) => {
    void _res;
    if (req.url) {
      if (req.url.startsWith('/socket.io/')) {
        req.url = '/socket.io' + req.url.slice(10);
      } else if (req.url === '/socket.io/') {
        req.url = '/socket.io';
      }
    }
  });

  // Socket.io 서버 바인딩
  initSocketServer(httpServer);

  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});