import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

export async function POST(req: NextRequest){
  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'userId가 필요합니다.' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    // OTP 시크릿 생성
    const secret = speakeasy.generateSecret({
      length: 20,
      name: `ZeroWatch:${user.email}`,
      issuer: 'ZeroWatch IDC',
    });

    // DB에 시크릿 키 임시 저장 (mfaSecret 사용)
    await prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: secret.base32 },
    });

    // QR 코드 이미지 DataURL 생성
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url || '');

    return NextResponse.json({
      message: 'OTP 시크릿이 생성되었습니다.',
      secret: secret.base32,
      qrCodeUrl,
    });
  } catch (error) {
    console.error('OTP Setup Error:', error);
    return NextResponse.json({ error: 'OTP 설정 중 오류가 발생했습니다.' }, { status: 500 });
  }
}