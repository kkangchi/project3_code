import { NextRequest, NextResponse } from "next/server";
import { redis, getUserSessionsKey, getSessionKey } from "@/lib/redis";

export async function GET(req: NextRequest){
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId가 필요합니다." }, { status: 400 });
    }

    const userSessionsKey = getUserSessionsKey(userId);
    const sessionIds = await redis.smembers(userSessionsKey);

    const activeSessions = [];
    for (const sid of sessionIds) {
      const data = await redis.get(getSessionKey(sid));
      if (data) {
        activeSessions.push(JSON.parse(data));
      } else {
        await redis.srem(userSessionsKey, sid);
      }
    }

    return NextResponse.json({ userId, activeSessions }, { status: 200 });
  } catch (error) {
    console.error("Fetch Sessions Error:", error);
    return NextResponse.json({ error: "세션 목록 조회 실패" }, { status: 500 });
  }
}