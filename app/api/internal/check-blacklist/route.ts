import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const ip = req.nextUrl.searchParams.get('ip');

  if (!ip) {
    return NextResponse.json({ isBlacklisted: false });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as Record<string, any>;
  const blocked = await db.blacklist.findFirst({
    where: { ipAddress: ip },
  });

  return NextResponse.json({ isBlacklisted: !!blocked });
}