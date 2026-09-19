import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { BLOCKED_COUNTRIES } from '@/lib/blockedCountries';
import { getCountryByIpCached } from '@/lib/geoCache';
import ipRangeCheck from 'ip-range-check';

export const config = {
  // /api/stats/* 등 통계 조회 API는 국가/블랙리스트 체크 대상에서 제외
  matcher: ['/api/auth/:path*', '/api/session/:path*', '/api/sessions'],
  runtime: 'nodejs',
};

export async function middleware(req: NextRequest) {
  const origin = req.headers.get('origin');
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:3000', 'http://localhost:3001'];

  const isAllowedOrigin = origin && allowedOrigins.includes(origin);
  const corsOrigin = isAllowedOrigin ? origin : allowedOrigins[0];

  const corsHeaders = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,DELETE,PATCH,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers':
      'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
  };

  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 200, headers: corsHeaders });
  }

  if (
    req.nextUrl.pathname.startsWith('/socket.io') ||
    req.nextUrl.pathname.startsWith('/api/internal/')
  ) {
    const response = NextResponse.next();
    Object.entries(corsHeaders).forEach(([key, value]) => response.headers.set(key, value));
    return response;
  }

  const forwardedFor = req.headers.get('x-forwarded-for');
  const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : '127.0.0.1';

  try {
    const activeEntries = await prisma.blacklist.findMany({
      where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      select: { ipAddress: true, reason: true },
    });

    const matched = activeEntries.find((entry) => {
      const targetIp = entry.ipAddress.trim();
      if (targetIp === clientIp) return true;
      if (targetIp.includes('/')) {
        try {
          return ipRangeCheck(clientIp, targetIp);
        } catch {
          return false;
        }
      }
      return false;
    });

    if (matched) {
      console.log(`ZERO_WATCH event=blacklist_reconnect srcip=${clientIp}`);
      return NextResponse.json(
        { error: '차단된 IP입니다.', reason: matched.reason },
        { status: 403, headers: corsHeaders }
      );
    }

    // 캐싱된 국가 조회 함수 사용 (같은 IP는 1시간 동안 재조회 안 함)
    const country = await getCountryByIpCached(clientIp);
    if (BLOCKED_COUNTRIES.includes(country)) {
      console.log(`ZERO_WATCH event=blacklist_reconnect srcip=${clientIp}`);
      return NextResponse.json(
        { error: '차단된 국가에서의 접근입니다.', reason: `차단 국가(${country})에서의 접근` },
        { status: 403, headers: corsHeaders }
      );
    }
  } catch (error) {
    console.error('Blacklist check error:', error);
  }

  const response = NextResponse.next();
  Object.entries(corsHeaders).forEach(([key, value]) => response.headers.set(key, value));
  return response;
}