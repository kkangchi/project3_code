import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import speakeasy from 'speakeasy';
import { createSession } from '@/lib/session';
import { redisPub } from '@/lib/redis';
import { recordLoginFailure, resetLoginFailure } from '@/lib/loginFailGuard';

export async function POST(req: NextRequest) {
  try {
    const { userId, token } = await req.json();

    const forwardedFor = req.headers.get('x-forwarded-for');
    const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : '127.0.0.1';

    if (!userId || !token) {
      return NextResponse.json({ error: 'userId와 token이 필요합니다.' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.mfaSecret) {
      return NextResponse.json({ error: 'OTP 시크릿 키가 존재하지 않습니다.' }, { status: 400 });
    }

    const verified = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token,
      window: 1,
    });

    // 1. OTP 검증 실패 분기 (실패 카운팅 반영)
    if (!verified) {
      await prisma.accessLog.create({
        data: {
          userId: user.id,
          ipAddress: clientIp,
          action: 'LOGIN_FAILED',
          isAnomaly: true,
          reason: '[OTP] 로그인 중 OTP 검증 실패',
        },
      });
      await recordLoginFailure(clientIp, 'OTP verification failed');
      return NextResponse.json({ error: '유효하지 않거나 만료된 OTP 번호입니다.' }, { status: 401 });
    }

    let currentCountry = 'UNKNOWN';
    try {
      const res = await fetch(`http://ip-api.com/json/${clientIp}?fields=countryCode`);
      currentCountry = (await res.json()).countryCode || 'UNKNOWN';
    } catch (e) {
      console.error('GeoIP lookup error:', e);
    }

    // AccessLog 기록 및 최신 접속 국가 업데이트
    await prisma.accessLog.create({
      data: {
        userId: user.id,
        ipAddress: clientIp,
        action: 'LOGIN_SUCCESS',
        isAnomaly: true,
        reason: `[${user.profile}] OTP 검증 통과 후 로그인 완료`,
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { lastCountry: currentCountry },
    });

    // 2. Redis 세션 생성 및 JWT 토큰 발급
    const { token: jwtToken, sessionId } = await createSession({
      userId: user.id,
      email: user.email,
      role: user.role,
      ipAddress: clientIp,
    });

    // 3. OTP 검증 성공 시 누적된 IP 실패 카운트 리셋
    await resetLoginFailure(clientIp);

    // 4. 로그인 성공 Redis Pub/Sub 이벤트 발행
    await redisPub.publish(
      'login:success',
      JSON.stringify({
        userId: user.id,
        email: user.email,
        ipAddress: clientIp,
        trustLevel: user.profile,
        isAnomaly: true,
        timestamp: new Date().toISOString(),
      })
    );

    // 5. 응답 반환 (sessionId 포함)
    const response = NextResponse.json(
      {
        message: 'OTP 인증 완료, 로그인 성공',
        trustLevel: user.profile,
        sessionId,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      },
      { status: 200 }
    );

    // 6. HTTP-Only 쿠키에 토큰 저장
    response.cookies.set('token', jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Login OTP Verify Error:', error);
    return NextResponse.json({ error: '처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}