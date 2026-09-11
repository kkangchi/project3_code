import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { blockIp } from "@/lib/blockIp";

// 기존 Spamhaus(cidr)와 신규 탐지 IP(ipAddress, needsNacl 등)를 모두 수용하는 인터페이스
interface BulkEntry {
  ipAddress?: string; // 단일 IP 또는 CIDR
  cidr?: string;      // 기존 Spamhaus 호환용
  source?: string;    // R-01, R-02, Spamhaus, Manual 등
  reason?: string;    // 상세 차단 사유
  needsNacl?: boolean;// AWS NACL 즉시 등록 여부
}

export async function POST(req: NextRequest) {
  // 1. 내부 API 시크릿 인증
  const internalSecret = req.headers.get("x-internal-secret");
  if (internalSecret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // 2. 요청 본문 유효성 검사
  const { entries } = (await req.json()) as { entries: BulkEntry[] };
  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: "entries 배열이 필요합니다." }, { status: 400 });
  }

  let upserted = 0;
  let failed = 0;

  // 3. 엔트리 순회 및 처리
  for (const entry of entries) {
    // ipAddress가 없으면 기존 cidr 값 사용 (둘 다 없으면 실패 처리)
    const targetIp = (entry.ipAddress || entry.cidr)?.trim();
    if (!targetIp) {
      failed++;
      continue;
    }

    try {
      // 출처 및 사유 텍스트 조합 (기존 Spamhaus 호환 유지)
      const sourceText = entry.source || "Spamhaus";
      const reasonText = entry.reason || `${sourceText} 자동 수집`;

      // DB 적재 (upsert) - schema.prisma의 source 필드도 함께 업데이트
      await prisma.blacklist.upsert({
        where: { ipAddress: targetIp },
        update: { 
          reason: reasonText, 
          source: sourceText 
        },
        create: { 
          ipAddress: targetIp, 
          reason: reasonText, 
          source: sourceText 
        },
      });

      // needsNacl이 true인 경우 AWS NACL 차단 실행
      if (entry.needsNacl) {
        await blockIp(targetIp, reasonText, 24);
      }

      upserted++;
    } catch (e) {
      console.error(`Bulk upsert 실패 (${targetIp}):`, e);
      failed++;
    }
  }

  return NextResponse.json(
    { message: `${upserted}개 등록 완료, ${failed}개 실패`, upserted, failed, total: entries.length },
    { status: 200 }
  );
}