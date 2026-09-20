import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // 배포 환경 Prisma 버전 불일치로 인한 타입체크 에러 우회
    ignoreBuildErrors: true,
  },
  
  // Next.js의 자동 트레일링 슬래시 308 리다이렉트 기능 완전 비활성화
  skipTrailingSlashRedirect: true,
  trailingSlash: false,

  async headers() {
    // server.ts의 동적 CORS 로직을 사용하므로 Next.js 응답 단계의 하드코딩 헤더를 제거합니다.
    return [];
  },
};

export default nextConfig;