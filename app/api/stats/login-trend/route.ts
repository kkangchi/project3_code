import { NextResponse } from 'next/server';

export async function GET(){
  // 시간대별(00시~23시) 정상/이상 로그인 접속자 수 가짜 데이터 반환
  return NextResponse.json({
    trend: [
      { hour: '00시', normal: 32, alert: 1 },
      { hour: '01시', normal: 18, alert: 0 },
      { hour: '02시', normal: 10, alert: 0 },
      { hour: '03시', normal: 5, alert: 0 },
      { hour: '04시', normal: 8, alert: 2 },
      { hour: '05시', normal: 15, alert: 1 },
      { hour: '06시', normal: 40, alert: 0 },
      { hour: '07시', normal: 85, alert: 3 },
      { hour: '08시', normal: 120, alert: 5 },
      { hour: '09시', normal: 210, alert: 12 },
      { hour: '10시', normal: 190, alert: 8 },
      { hour: '11시', normal: 175, alert: 4 },
      { hour: '12시', normal: 130, alert: 2 },
      { hour: '13시', normal: 165, alert: 6 },
      { hour: '14시', normal: 180, alert: 9 },
      { hour: '15시', normal: 195, alert: 7 },
      { hour: '16시', normal: 160, alert: 3 },
      { hour: '17시', normal: 140, alert: 2 },
      { hour: '18시', normal: 95, alert: 1 },
      { hour: '19시', normal: 60, alert: 0 },
      { hour: '20시', normal: 45, alert: 1 },
      { hour: '21시', normal: 50, alert: 2 },
      { hour: '22시', normal: 40, alert: 0 },
      { hour: '23시', normal: 25, alert: 0 },
    ],
  }, { status: 200 });
}