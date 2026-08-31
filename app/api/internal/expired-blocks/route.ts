import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const internalSecret = req.headers.get("x-internal-secret");
  if (internalSecret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const expired = await prisma.blacklist.findMany({
    where: { expiresAt: { lte: new Date() }, ruleNumber: { not: null } },
    select: { ipAddress: true, ruleNumber: true },
  });

  if (expired.length === 0) {
    return NextResponse.json({ expiredBlocks: [] }, { status: 200 });
  }

  await prisma.blacklist.deleteMany({
    where: { ipAddress: { in: expired.map((e) => e.ipAddress) } },
  });

  return NextResponse.json({ expiredBlocks: expired }, { status: 200 });
}