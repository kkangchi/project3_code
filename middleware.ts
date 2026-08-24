import { NextRequest, NextResponse } from 'next/server';

export async function middleware(req: NextRequest) {
  // 내부 검증 API 호출 자체는 미들웨어 검사 스킵 (무한 재호출 방지)
  if (req.nextUrl.pathname.startsWith('/api/internal/')) {
    return NextResponse.next();
  }

  const forwardedFor = req.headers.get('x-forwarded-for');
  const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : '127.0.0.1';

  try {
    const checkRes = await fetch(`${req.nextUrl.origin}/api/internal/check-blacklist?ip=${clientIp}`);
    const { isBlacklisted } = await checkRes.json();

    if (isBlacklisted) {
      return NextResponse.json(
        { error: '차단된 IP입니다.' },
        { status: 403 }
      );
    }
  } catch (error) {
    console.error('Blacklist check error:', error);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};