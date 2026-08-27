import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import speakeasy from 'speakeasy';

export async function POST(req: NextRequest){
  try {
    const { userId, token } = await req.json();

    if (!userId || !token) {
      return NextResponse.json({ error: 'userId와 token이 필요합니다.' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });

    // mfaSecret 필드 검증
    if (!user || !user.mfaSecret) {
      return NextResponse.json({ error: 'OTP 시크릿 키가 존재하지 않습니다.' }, { status: 400 });
    }

    // TOTP 번호 검증 (시간 오차 범위 window: 1 허용)
    const verified = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token,
      window: 1,
    });

    if (!verified) {
      return NextResponse.json({ error: '유효하지 않거나 만료된 OTP 번호입니다.' }, { status: 401 });
    }

    // OTP 검증 성공 시 isMfaActive 활성화
    await prisma.user.update({
      where: { id: userId },
      data: { isMfaActive: true },
    });

    return NextResponse.json({ message: 'OTP 인증이 성공적으로 완료되었습니다.' }, { status: 200 });
  } catch (error) {
    console.error('OTP Verify Error:', error);
    return NextResponse.json({ error: 'OTP 검증 중 오류가 발생했습니다.' }, { status: 500 });
  }
}