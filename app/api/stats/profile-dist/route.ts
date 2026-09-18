import { NextResponse } from 'next/server';

export async function GET(){
  // Zero Trust 신뢰도 프로파일별 인원 수 가짜 데이터 반환
  return NextResponse.json({
    distribution: [
      { profile: 'Low', count: 62 },
      { profile: 'High', count: 24 },
      { profile: 'Zero-Trust', count: 14 },
    ],
  }, { status: 200 });
}