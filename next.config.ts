import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // 배포 환경 Prisma 버전 불일치로 인한 타입체크 에러 우회
    ignoreBuildErrors: true,
  },
  // Socket.io 끝자리 슬래시(/) 308 리다이렉트 방지
  skipTrailingSlashRedirect: true,

  async headers() {
    return [
      {
        // 모든 경로에 CORS 헤더 강제 주입
        source: "/:path*",
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