import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    // 접속 클라이언트 IP 추출
    const forwardedFor = req.headers.get('x-forwarded-for');
    const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : '127.0.0.1';

    if (!email || !password) {
      return NextResponse.json(
        { error: '이메일과 비밀번호를 모두 입력해주세요.' },
        { status: 400 }
      );
    }

    // 1. 유저 존재 여부 확인
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // 실패 로그 기록 (계정 없음)
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

    // 2. 비밀번호 일치 여부 확인
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      // 실패 로그 기록 (비밀번호 불일치)
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

    // 3. 로그인 성공 로그 기록
    await prisma.accessLog.create({
      data: {
        userId: user.id,
        ipAddress: clientIp,
        action: 'LOGIN_SUCCESS',
        isAnomaly: false,
        reason: 'Login successful',
      },
    });

    // 4. JWT 토큰 발급
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    // 5. 쿠키 설정 및 응답 반환
    const response = NextResponse.json(
      {
        message: '로그인 성공',
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
      maxAge: 60 * 60 * 24, // 1일
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