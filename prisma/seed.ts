import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main(){
  const hashedPassword = await bcrypt.hash("1234", 10);

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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });