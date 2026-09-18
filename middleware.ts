import { NextRequest, NextResponse } from 'next/server';

export async function middleware(req: NextRequest) {
  const origin = req.headers.get('origin');

  // 1. .env 환경변수 또는 기본 허용 Origin 목록 구성
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:3000', 'http://localhost:3001'];

  // 요청 온 Origin이 허용 목록에 있으면 헤더 세팅, 없으면 기본값
  const isAllowedOrigin = origin && allowedOrigins.includes(origin);
  const corsOrigin = isAllowedOrigin ? origin : allowedOrigins[0];

  const corsHeaders = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,DELETE,PATCH,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers':
      'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
  };

  // 2. Preflight(OPTIONS) 요청 시 검사 스킵 및 CORS 응답 반환
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  // 3. Socket.io 및 내부 API 검사는 미들웨어 로직 스킵
  if (
    req.nextUrl.pathname.startsWith('/socket.io') ||
    req.nextUrl.pathname.startsWith('/api/internal/')
  ) {
    const response = NextResponse.next();
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    return response;
  }

  // 4. IP 차단 및 국가 차단 검사
  const forwardedFor = req.headers.get('x-forwarded-for');
  const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : '127.0.0.1';

  try {
    const checkRes = await fetch(
      `${req.nextUrl.origin}/api/internal/check-blacklist?ip=${clientIp}`
    );
    const { isBlacklisted, isCountryBlocked, reason } = await checkRes.json();

    if (isBlacklisted) {
      return NextResponse.json(
        { error: '차단된 IP입니다.', reason },
        { status: 403, headers: corsHeaders }
      );
    }

    if (isCountryBlocked) {
      return NextResponse.json(
        { error: '차단된 국가에서의 접근입니다.', reason },
        { status: 403, headers: corsHeaders }
      );
    }
  } catch (error) {
    console.error('Blacklist check error:', error);
  }

  // 5. 모든 검과 통과 시 CORS 헤더 포함하여 통과
  const response = NextResponse.next();
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};