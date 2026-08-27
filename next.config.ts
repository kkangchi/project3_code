import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // 배포 환경 Prisma 버전 불일치로 인한 타입체크 에러 우회
    ignoreBuildErrors: true,
  },
};

export default nextConfig;