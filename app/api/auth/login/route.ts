import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { createSession } from '@/lib/session';
import { redisPub } from '@/lib/redis';
import { recordLoginFailure, resetLoginFailure } from '@/lib/loginFailGuard';

async function getCountryByIp(ip: string): Promise<string> {
  try {
    if (ip === '127.0.0.1' || ip.startsWith('10.') || ip.startsWith('192.168.')) {
      return 'UNKNOWN';
    }
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`);
    const data = await res.json();
    return data.countryCode || 'UNKNOWN';
  } catch (error) {
    console.error('GeoIP lookup error:', error);
    return 'UNKNOWN';
  }
}

async function publishAnomaly(user: { id: string; email: string }, clientIp: string, reason: string, trustLevel: string) {
  await redisPub.publish(
    'login:anomaly',
    JSON.stringify({
      userId: user.id,
      email: user.email,
      ipAddress: clientIp,
      reason,
      trustLevel,
      timestamp: new Date().toISOString(),
    })
  );
}

async function issueLoginResponse(
  user: { id: string; email: string; name: string; role: string },
  clientIp: string,
  trustLevel: string,
  isAnomaly: boolean,
  extra: Record<string, unknown> = {}
) {
  const { token, sessionId } = await createSession({
    userId: user.id,
    email: user.email,
    role: user.role,
    ipAddress: clientIp,
  });

  await resetLoginFailure(clientIp);

  await redisPub.publish(
    'login:success',
    JSON.stringify({
      userId: user.id,
      email: user.email,
      ipAddress: clientIp,
      trustLevel,
      isAnomaly,
      timestamp: new Date().toISOString(),
    })
  );

  const response = NextResponse.json(
    {
      message: '로그인 성공',
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      sessionId,
      trustLevel,
      isAnomaly,
      ...extra,
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
}

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    const forwardedFor = req.headers.get('x-forwarded-for');
    const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : '127.0.0.1';
    const currentCountry = await getCountryByIp(clientIp);

    if (!email || !password) {
      return NextResponse.json({ error: '이메일과 비밀번호를 모두 입력해주세요.' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      await prisma.accessLog.create({
        data: { ipAddress: clientIp, action: 'LOGIN_FAILED', isAnomaly: true, reason: 'User not found' },
      });
      await recordLoginFailure(clientIp, 'User not found');
      return NextResponse.json({ error: '존재하지 않는 이메일입니다.' }, { status: 401 });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      await prisma.accessLog.create({
        data: { userId: user.id, ipAddress: clientIp, action: 'LOGIN_FAILED', isAnomaly: true, reason: 'Invalid password' },
      });
      await recordLoginFailure(clientIp, 'Invalid password');
      return NextResponse.json({ error: '비밀번호가 일치하지 않습니다.' }, { status: 401 });
    }

    let isAnomaly = false;
    let anomalyDetail = '정상 위치 접근';
    if (user.lastCountry && user.lastCountry !== 'UNKNOWN' && currentCountry !== 'UNKNOWN') {
      if (user.lastCountry !== currentCountry) {
        isAnomaly = true;
        anomalyDetail = `이전 접속 국가(${user.lastCountry})와 다른 국가(${currentCountry})에서 접속함`;
      }
    }

    // ── LOW ──
    if (user.profile === 'LOW') {
      await prisma.accessLog.create({
        data: {
          userId: user.id,
          ipAddress: clientIp,
          action: 'LOGIN_SUCCESS',
          isAnomaly,
          reason: `[LOW] ${isAnomaly ? `${anomalyDetail} (프로파일 정책상 통과)` : '정상 로그인'}`,
        },
      });
      if (isAnomaly) await publishAnomaly(user, clientIp, anomalyDetail, 'LOW');
      await prisma.user.update({ where: { id: user.id }, data: { lastCountry: currentCountry } });
      return await issueLoginResponse(user, clientIp, 'LOW', isAnomaly);
    }

    // ── HIGH ──
    if (user.profile === 'HIGH') {
      if (!user.mfaSecret) {
        await prisma.accessLog.create({
          data: {
            userId: user.id, ipAddress: clientIp, action: 'LOGIN_BLOCKED', isAnomaly,
            reason: `[HIGH] OTP 미등록으로 로그인 불가 (${anomalyDetail})`,
          },
        });
        return NextResponse.json(
          { error: 'HIGH 프로파일은 OTP 등록이 필요합니다. /api/auth/otp/setup을 먼저 진행하세요.', trustLevel: 'HIGH' },
          { status: 403 }
        );
      }
      await prisma.accessLog.create({
        data: {
          userId: user.id, ipAddress: clientIp, action: 'LOGIN_OTP_REQUIRED', isAnomaly,
          reason: `[HIGH] ID/PW 통과, OTP 검증 대기 (${anomalyDetail})`,
        },
      });
      if (isAnomaly) await publishAnomaly(user, clientIp, anomalyDetail, 'HIGH');
      return NextResponse.json(
        { message: 'OTP 인증이 필요합니다.', requireOtp: true, trustLevel: 'HIGH', userId: user.id },
        { status: 200 }
      );
    }

    // ── ZERO_TRUST ──
    if (!isAnomaly) {
      await prisma.accessLog.create({
        data: { userId: user.id, ipAddress: clientIp, action: 'LOGIN_SUCCESS', isAnomaly, reason: '[ZERO_TRUST] 정상 위치 접근' },
      });
      await prisma.user.update({ where: { id: user.id }, data: { lastCountry: currentCountry } });
      return await issueLoginResponse(user, clientIp, 'ZERO_TRUST', isAnomaly);
    }

    await publishAnomaly(user, clientIp, `ZERO_TRUST ${anomalyDetail}`, 'ZERO_TRUST');

    if (user.mfaSecret) {
      await prisma.accessLog.create({
        data: {
          userId: user.id, ipAddress: clientIp, action: 'LOGIN_OTP_REQUIRED', isAnomaly,
          reason: `[ZERO_TRUST] ${anomalyDetail} -> OTP 요구`,
        },
      });
      return NextResponse.json(
        { message: '이상 접근이 감지되었습니다. OTP 인증이 필요합니다.', requireOtp: true, trustLevel: 'ZERO_TRUST', userId: user.id },
        { status: 200 }
      );
    }

    await prisma.accessLog.create({
      data: {
        userId: user.id, ipAddress: clientIp, action: 'LOGIN_BLOCKED', isAnomaly,
        reason: `[ZERO_TRUST] ${anomalyDetail} + OTP 미등록 -> 관리자 승인 대기`,
      },
    });
    return NextResponse.json(
      { error: '이상 접근이 감지되었으며 OTP가 미등록 상태입니다. 관리자 승인이 필요합니다.', trustLevel: 'ZERO_TRUST', status: 'PENDING_ADMIN_APPROVAL' },
      { status: 403 }
    );
  } catch (error) {
    console.error('Login Error:', error);
    return NextResponse.json({ error: '로그인 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
} 