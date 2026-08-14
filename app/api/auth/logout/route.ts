import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { redis } from '@/lib/redis';

const JWT_SECRET = process.env.JWT_SECRET || 'zerowatch-secret-key-1234';

export async function POST(request: Request){
  try {
    const token = request.headers.get('cookie')
      ?.split('; ')
      .find((row) => row.startsWith('token='))
      ?.split('=')[1];

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
        // Redis에서 세션 삭제
        await redis.del(`session:${decoded.userId}`);
      } catch {
        // 토큰만 유효하지 않은 경우 무시하고 쿠키만 삭제 진행
      }
    }

    const response = NextResponse.json({
      message: '로그아웃이 완료되었습니다.',
    });

    // 쿠키 만료 처리
    response.cookies.set('token', '', {
      httpOnly: true,
      path: '/',
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error('Logout Error:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}