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

  // 1. 블랙리스트 확인 — 낱개 IP + CIDR 대역(Spamhaus) 대응
  const activeEntries = await prisma.blacklist.findMany({
    where: {
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { ipAddress: true, reason: true },
  });

  const matched = activeEntries.find((entry) => {
    const targetIp = entry.ipAddress.trim();
    if (targetIp === ip) return true;
    if (targetIp.includes('/')) {
      try {
        return ipRangeCheck(ip, targetIp);
      } catch {
        return false;
      }
    }
    return false;
  });

  if (matched) {
    // Wazuh Rule 100500 (R-05) 탐지용 표준 로그 출력
    console.log(`ZERO_WATCH event=blacklist_reconnect srcip=${ip}`);
    return NextResponse.json({ isBlacklisted: true, isCountryBlocked: false, reason: matched.reason });
  }

  // 2. 국가 차단 확인
  const country = await getCountryByIp(ip);
  if (BLOCKED_COUNTRIES.includes(country)) {
    // 국가 차단도 접속 재시도 탐지용 로그 출력
    console.log(`ZERO_WATCH event=blacklist_reconnect srcip=${ip}`);
    return NextResponse.json({
      isBlacklisted: false,
      isCountryBlocked: true,
      reason: `차단 국가(${country})에서의 접근`,
    });
  }

  return NextResponse.json({ isBlacklisted: false, isCountryBlocked: false });
}