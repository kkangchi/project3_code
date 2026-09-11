import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface BulkEntry {
  cidr: string;
  source?: string;
}

export async function POST(req: NextRequest){
  const internalSecret = req.headers.get("x-internal-secret");
  if (internalSecret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { entries } = (await req.json()) as { entries: BulkEntry[] };
  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: "entries 배열이 필요합니다." }, { status: 400 });
  }

  let upserted = 0;
  let failed = 0;

  for (const entry of entries) {
    if (!entry.cidr) {
      failed++;
      continue;
    }

    try {
      await prisma.blacklist.upsert({
        where: { ipAddress: entry.cidr },
        update: { reason: `Spamhaus 자동 수집 (${entry.source || "spamhaus"})` },
        create: { ipAddress: entry.cidr, reason: `Spamhaus 자동 수집 (${entry.source || "spamhaus"})` },
      });
      upserted++;
    } catch (e) {
      console.error(`Bulk upsert 실패 (${entry.cidr}):`, e);
      failed++;
    }
  }

  return NextResponse.json(
    { message: `${upserted}개 등록 완료, ${failed}개 실패`, upserted, failed, total: entries.length },
    { status: 200 }
  );
}