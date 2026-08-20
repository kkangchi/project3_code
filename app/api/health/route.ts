import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';

export async function GET(){
  try {
    await prisma.$queryRaw`SELECT 1`;
    const redisPing = await redis.ping();
    if (redisPing !== 'PONG') throw new Error('Redis ping failed');

    return NextResponse.json(
      { status: 'healthy', timestamp: new Date().toISOString() },
      { status: 200 }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { status: 'unhealthy', error: errorMessage },
      { status: 503 }
    );
  }
}