import { NextResponse } from 'next/server';

// CORS 공통 헤더 설정
const corsHeaders = {
  'Access-Control-Allow-Origin': 'http://localhost:3001',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
};

// 1. Preflight(OPTIONS) 요청 대응
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

// 2. 실제 GET 요청 대응
export async function GET() {
  const data = {
    status: 'ok',
    message: 'Stats retrieved successfully',
  };

  return NextResponse.json(data, {
    status: 200,
    headers: corsHeaders,
  });
}