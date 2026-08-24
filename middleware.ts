import { NextRequest, NextResponse } from 'next/server';

export async function middleware(req: NextRequest){
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
    // 확인 실패 시 시스템 중단을 막기 위해 일단 통과 (fail-open)
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};