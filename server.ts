import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '.env') });

import { createServer } from 'http';
import next from 'next';
import { initSocketServer } from './lib/socket';

const dev = process.env.NODE_ENV !== 'production';

// Next.js 앱 생성 (hostname/port 명시)
const app = next({ dev, hostname: '0.0.0.0', port: process.env.PORT ? parseInt(process.env.PORT) : 3000 });
const handle = app.getRequestHandler();
const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    // 1. ALB(Proxy) 헤더 보정 및 Host/Protocol 정규화
    if (req.headers['x-forwarded-proto']) {
      req.headers['x-forwarded-proto'] = 'https';
    }
    if (req.headers['x-forwarded-host']) {
      req.headers['host'] = req.headers['x-forwarded-host'] as string;
    }

    // 2. [CORS 헤더 설정] 허용할 Origin 검증 및 CORS 헤더 주입
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

    // 3. [OPTIONS Preflight 처리] 브라우저 Preflight 요청은 즉시 204 응답
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // 4. [Socket.io 및 Trailing Slash 308 Redirect 방지 정밀 보정]
    if (req.url) {
      // /socket.io/?EIO=4... 처럼 /socket.io/ 뒤에 쿼리스트링이나 슬래시가 붙는 경우 정규화
      if (req.url.startsWith('/socket.io/')) {
        req.url = '/socket.io' + req.url.slice(10); // '/socket.io/' 이후 문자열(?EIO=4...)을 그대로 유지
      } else if (req.url === '/socket.io/') {
        req.url = '/socket.io';
      } else if (req.url.length > 1 && req.url.endsWith('/') && !req.url.startsWith('/_next/')) {
        // 일반 Next.js 경로의 trailing slash 제거
        req.url = req.url.slice(0, -1);
      }
    }

    // 5. 실제 요청을 Next.js 요청 핸들러로 전달
    handle(req, res);
  });

  // Socket.io 서버 초기화 및 HTTP 서버 바인딩
  initSocketServer(httpServer);

  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});