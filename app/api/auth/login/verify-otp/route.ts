import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import speakeasy from 'speakeasy';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

export async function POST(req: NextRequest){
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

    if (!verified) {
      await prisma.accessLog.create({
        data: { userId: user.id, ipAddress: clientIp, action: 'LOGIN_FAILED', isAnomaly: true, reason: '[OTP] 로그인 중 OTP 검증 실패' },
      });
      return NextResponse.json({ error: '유효하지 않거나 만료된 OTP 번호입니다.' }, { status: 401 });
    }

    let currentCountry = 'UNKNOWN';
    try {
      const res = await fetch(`http://ip-api.com/json/${clientIp}?fields=countryCode`);
      currentCountry = (await res.json()).countryCode || 'UNKNOWN';
    } catch (e) {
      console.error('GeoIP lookup error:', e);
    }

    await prisma.accessLog.create({
      data: { userId: user.id, ipAddress: clientIp, action: 'LOGIN_SUCCESS', isAnomaly: true, reason: `[${user.profile}] OTP 검증 통과 후 로그인 완료` },
    });

    await prisma.user.update({ where: { id: user.id }, data: { lastCountry: currentCountry } });

    const jwtToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    const response = NextResponse.json(
      {
        message: 'OTP 인증 완료, 로그인 성공',
        trustLevel: user.profile,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      },
      { status: 200 }
    );

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