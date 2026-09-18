import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// DB에 저장된 값(LOW/HIGH/ZERO_TRUST)을 이서진님 스펙(Low/High/Zero-Trust)으로 변환
const PROFILE_LABEL: Record<string, string> = {
  LOW: 'Low',
  HIGH: 'High',
  ZERO_TRUST: 'Zero-Trust',
};

export async function GET() {
  try {
    const grouped = await prisma.user.groupBy({
      by: ['profile'],
      _count: { profile: true },
    });

    const distribution = grouped.map((g) => ({
      profile: PROFILE_LABEL[g.profile] || g.profile,
      count: g._count.profile,
    }));

    return NextResponse.json({ distribution }, { status: 200 });
  } catch (error) {
    console.error('Error fetching profile distribution:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}