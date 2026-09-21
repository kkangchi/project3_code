import { NextRequest, NextResponse } from "next/server";
import { publishAnomalyAlert } from "@/lib/redis";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 지영이 이상 탐지 데이터를 Redis 채널로 발행
    const result = await publishAnomalyAlert({
      userId: body.userId,
      userEmail: body.userEmail,
      ruleId: body.ruleId,
      ruleName: body.ruleName,
      ip: body.ip,
      timestamp: body.timestamp,
    });

    if (!result.success) {
      return NextResponse.json({ error: "Failed to publish alert" }, { status: 500 });
    }

    return NextResponse.json({ message: "Anomaly alert processed successfully" });
  } catch (error) {
    console.error("[Step 3 API Error]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}