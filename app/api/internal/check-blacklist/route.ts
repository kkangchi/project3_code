import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { BLOCKED_COUNTRIES } from '@/lib/blockedCountries';
import ipRangeCheck from 'ip-range-check';

async function getCountryByIp(ip: string): Promise<string> {
  try {
    if (ip === '127.0.0.1' || ip.startsWith('10.') || ip.startsWith('192.168.')) {
      return 'UNKNOWN';
    }
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`);
    const text = await res.text();
    if (!text) return 'UNKNOWN';
    const data = JSON.parse(text);
    return data.countryCode || 'UNKNOWN';
  } catch (error) {
    console.error('GeoIP lookup error:', error);
    return 'UNKNOWN';
  }
}

export async function GET(req: NextRequest) {
  const ip = req.nextUrl.searchParams.get('ip');
  if (!ip) {
    return NextResponse.json({ isBlacklisted: false, isCountryBlocked: false });
  }

  // 1. 블랙리스트 확인 — 낱개 IP + CIDR 대역(Spamhaus) 둘 다 대응, 만료 안 된 것만
  // any 타입 대신 Prisma 모델 직접 참조
  const activeEntries = await prisma.blacklist.findMany({
    where: {
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { ipAddress: true, reason: true },
  });

  const matched = activeEntries.find((entry) => {
    // 낱개 IP 완전 일치 또는 CIDR 대역 포함 여부
    if (entry.ipAddress === ip) return true;
    if (entry.ipAddress.includes('/')) {
      try {
        return ipRangeCheck(ip, entry.ipAddress);
      } catch {
        return false;
      }
    }
    return false;
  });

  if (matched) {
    return NextResponse.json({ isBlacklisted: true, isCountryBlocked: false, reason: matched.reason });
  }

  // 2. 국가 차단 확인
  const country = await getCountryByIp(ip);
  if (BLOCKED_COUNTRIES.includes(country)) {
    return NextResponse.json({
      isBlacklisted: false,
      isCountryBlocked: true,
      reason: `차단 국가(${country})에서의 접근`,
    });
  }

  return NextResponse.json({ isBlacklisted: false, isCountryBlocked: false });
}