import { NextRequest, NextResponse } from "next/server";
import { revokeSession } from "@/lib/redis";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest){
  try {
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";
    const { sessionId, reason } = await req.json();

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId가 필요합니다." }, { status: 400 });
    }

    const { userId } = await revokeSession(sessionId, reason || "USER_REVOKE");

    if (userId) {
      await prisma.accessLog.create({
        data: {
          userId,
          ipAddress: clientIp,
          action: "SESSION_REVOKED",
          reason: `세션 강제 종료 (${sessionId}): ${reason || "대시보드 요청에 의한 종료"}`,
        },
      });
    }

    return NextResponse.json({ message: "세션이 성공적으로 종료되었습니다.", sessionId }, { status: 200 });
  } catch (error) {
    console.error("Session Kill Error:", error);
    return NextResponse.json({ error: "세션 종료 처리 중 오류 발생" }, { status: 500 });
  }
}