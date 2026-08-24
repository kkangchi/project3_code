import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import geoip from 'geoip-lite';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    const forwardedFor = req.headers.get('x-forwarded-for');
    const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : '127.0.0.1';

    const geo = geoip.lookup(clientIp);
    const currentCountry = geo ? geo.country : 'UNKNOWN';

    if (!email || !password) {
      return NextResponse.json(
        { error: '이메일과 비밀번호를 모두 입력해주세요.' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      await prisma.accessLog.create({
        data: {
          ipAddress: clientIp,
          action: 'LOGIN_FAILED',
          isAnomaly: true,
          reason: 'User not found',
        },
      });

      return NextResponse.json(
        { error: '존재하지 않는 이메일입니다.' },
        { status: 401 }
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      await prisma.accessLog.create({
        data: {
          userId: user.id,
          ipAddress: clientIp,
          action: 'LOGIN_FAILED',
          isAnomaly: true,
          reason: 'Invalid password',
        },
      });

      return NextResponse.json(
        { error: '비밀번호가 일치하지 않습니다.' },
        { status: 401 }
      );
    }

    const lastSuccessLog = await prisma.accessLog.findFirst({
      where: {
        userId: user.id,
        action: 'LOGIN_SUCCESS',
      },
      orderBy: { createdAt: 'desc' },
    });

    let isAnomaly = false;
    let reason = 'Login successful';

    if (lastSuccessLog) {
      const lastGeo = geoip.lookup(lastSuccessLog.ipAddress);
      const lastCountry = lastGeo ? lastGeo.country : 'UNKNOWN';

      if (lastCountry !== 'UNKNOWN' && currentCountry !== 'UNKNOWN' && lastCountry !== currentCountry) {
        isAnomaly = true;
        reason = `이전 접속 국가(${lastCountry})와 다른 국가(${currentCountry})에서 접속함`;
      }
    }

    await prisma.accessLog.create({
      data: {
        userId: user.id,
        ipAddress: clientIp,
        action: 'LOGIN_SUCCESS',
        isAnomaly,
        reason,
      },
    });

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    const response = NextResponse.json(
      {
        message: '로그인 성공',
        isAnomaly,
        reason,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      },
      { status: 200 }
    );

    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Login Error:', error);
    return NextResponse.json(
      { error: '로그인 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}