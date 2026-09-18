import { NextResponse } from 'next/server';

export async function GET(){
  // 탐지된 보안 룰별(R-01~R-06) 건수 가짜 데이터 반환
  return NextResponse.json({
    rules: [
      { ruleId: 'R-01', label: '브루트포스', count: 12 },
      { ruleId: 'R-02', label: '포트스캔', count: 34 },
      { ruleId: 'R-03', label: '비정상 IP', count: 8 },
      { ruleId: 'R-04', label: 'SQL 인젝션', count: 19 },
      { ruleId: 'R-05', label: '권한 오남용', count: 5 },
      { ruleId: 'R-06', label: 'XSS 시도', count: 2 },
    ],
  }, { status: 200 });
}