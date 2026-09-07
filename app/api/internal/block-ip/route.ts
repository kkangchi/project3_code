import { NextRequest, NextResponse } from "next/server";
import { blockIp } from "@/lib/blockIp";

export async function POST(req: NextRequest) {
  try {
    const internalSecret = req.headers.get("x-internal-secret");
    if (internalSecret !== process.env.INTERNAL_API_SECRET) {
      return NextResponse.json({ error: "Unauthorized internal call" }, { status: 403 });
    }

    const { ipAddress, reason, ttlHours = 24 } = await req.json();
    if (!ipAddress) {
      return NextResponse.json({ error: "ipAddress가 필요합니다." }, { status: 400 });
    }

    const { ruleNumber, expiresAt } = await blockIp(ipAddress, reason || "AWS NACL 자동 차단", ttlHours);

    return NextResponse.json(
      { message: `IP ${ipAddress}가 NACL(규칙 #${ruleNumber})에 차단 등록되었습니다.`, ruleNumber, expiresAt },
      { status: 200 }
    );
  } catch (error) {
    console.error("Block IP Error:", error);
    return NextResponse.json({ error: "NACL IP 차단 등록 실패" }, { status: 500 });
  }
}