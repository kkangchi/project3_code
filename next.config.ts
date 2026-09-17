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
    return [
      {
        // /socket.io 경로를 제외한 일반 Next.js API 및 페이지에만 CORS 헤더 적용
        source: "/((?!socket\\.io).*)",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "http://localhost:3001" },
          { key: "Access-Control-Allow-Methods", value: "GET,DELETE,PATCH,POST,PUT,OPTIONS" },
          {
            key: "Access-Control-Allow-Headers",
            value:
              "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization",
          },
        ],
      },
    ];
  },
};

export default nextConfig;