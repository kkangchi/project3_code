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

    // 4. 일반 Next.js 핸들러 전달
    handle(req, res);
  });

// [CRITICAL] Socket.io 및 다른 모든 라우터보다 먼저 req.url을 가로채서 정규화
httpServer.prependListener('request', (req, _res) => {
  void _res; // 미사용 변수 경고 방지
  if (req.url) {
    if (req.url.startsWith('/socket.io/')) {
      req.url = '/socket.io' + req.url.slice(10);
    } else if (req.url === '/socket.io/') {
      req.url = '/socket.io';
    }
  }
});

  // Socket.io 서버 초기화 및 HTTP 서버 바인딩
  initSocketServer(httpServer);

  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});