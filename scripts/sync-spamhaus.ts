import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function syncSpamhaus() {
  console.log('Spamhaus DROP 리스트 동기화 시작...');
  try {
    // 1. Spamhaus 최신 DROP 텍스트 파일 다운로드
    const response = await fetch('https://www.spamhaus.org/drop/drop.txt');
    if (!response.ok) {
      throw new Error(`Spamhaus 응답 에러: ${response.statusText}`);
    }

    const text = await response.text();
    const lines = text.split('\n');

    // 2. 주석(;으로 시작) 및 빈 줄을 제외하고 CIDR 대역만 추출
    const cidrList: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(';')) continue;
      // 예: "23.94.252.0/24 ; SBL123456" 형태에서 CIDR 추출
      const cidr = trimmed.split(';')[0].trim();
      if (cidr && cidr.includes('/')) {
        cidrList.push(cidr);
      }
    }

    console.log(`총 ${cidrList.length}개의 Spamhaus CIDR 대역을 감지했습니다.`);

    // 3. 기존 Spamhaus 자동 등록 데이터 정돈 후 대량 업데이트 (Transaction)
    let addedCount = 0;
    for (const cidr of cidrList) {
      const exists = await prisma.blacklist.findFirst({
        where: { ipAddress: cidr },
      });

      if (!exists) {
        await prisma.blacklist.create({
          data: {
            ipAddress: cidr,
            reason: 'Spamhaus DROP Automatic Sync',
          },
        });
        addedCount++;
      }
    }

    console.log(`Spamhaus 동기화 완료: ${addedCount}개의 신규 대역이 DB에 추가되었습니다.`);
  } catch (error) {
    console.error('Spamhaus 동기화 중 오류 발생:', error);
  } finally {
    await prisma.$disconnect();
  }
}

syncSpamhaus();