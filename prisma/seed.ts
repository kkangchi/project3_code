import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main(){
  const hashedPassword = await bcrypt.hash("1234", 10);

  // 계정 1: 기본 관리자 (LOW 프로파일)
  const user = await prisma.user.upsert({
    where: { email: "admin@zerowatch.com" },
    update: {},
    create: {
      email: "admin@zerowatch.com",
      password: hashedPassword,
      name: "관리자",
      profile: "LOW",
    },
  });
  console.log("테스트 계정 생성 완료:", user.email);

  // 계정 2: ZERO_TRUST + OTP 미등록 (관리자 승인 대기 차단 테스트용)
  const user2 = await prisma.user.upsert({
    where: { email: "user2@zerowatch.com" },
    update: {},
    create: {
      email: "user2@zerowatch.com",
      password: hashedPassword,
      name: "테스트유저2",
      profile: "ZERO_TRUST",
      lastCountry: "KR",
      // mfaSecret 필드를 안 넣었으므로 OTP 미등록 상태로 생성됨
    },
  });
  console.log("테스트 계정2 생성 완료:", user2.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });