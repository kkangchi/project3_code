import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const logs = await prisma.accessLog.findMany({
      where: {
        createdAt: { gte: today },
        action: { in: ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGIN_BLOCKED'] },
      },
      select: { createdAt: true, isAnomaly: true },
    });

    // 00시~23시 24개 슬롯 초기화
    const hourly: { hour: string; normal: number; alert: number }[] = Array.from(
      { length: 24 },
      (_, i) => ({ hour: `${String(i).padStart(2, '0')}시`, normal: 0, alert: 0 })
    );

    for (const log of logs) {
      const hourIndex = log.createdAt.getHours();
      if (log.isAnomaly) {
        hourly[hourIndex].alert += 1;
      } else {
        hourly[hourIndex].normal += 1;
      }
    }

    return NextResponse.json({ trend: hourly }, { status: 200 });
  } catch (error) {
    console.error('Error fetching login trend:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}