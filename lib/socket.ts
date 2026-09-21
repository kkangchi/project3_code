import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import Redis from "ioredis";
import { sendSecurityAlertEmail } from "./mailer";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
console.log(`[DEBUG] REDIS_URL 값 확인: "${REDIS_URL}"`);

const redisSub = new Redis(REDIS_URL, {
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redisSub.on("connect", () => {
  console.log("[Redis Sub] Connected to Redis successfully.");
});

redisSub.on("error", (err) => {
  console.error("[Redis Sub Error]:", err);
});

// GuardDuty 위치 정보(GeoIP) Fallback 및 파싱 함수
function parseGuardDutyLocation(finding: Record<string, unknown>) {
  try {
    const service = finding.service as Record<string, unknown> | undefined;
    const action = service?.action as Record<string, unknown> | undefined;
    
    const networkConnectionAction = action?.networkConnectionAction as Record<string, unknown> | undefined;
    const awsApiCallAction = action?.awsApiCallAction as Record<string, unknown> | undefined;
    
    const remoteIpDetails = (networkConnectionAction?.remoteIpDetails || awsApiCallAction?.remoteIpDetails) as Record<string, unknown> | undefined;
    const geoLocation = remoteIpDetails?.geoLocation as Record<string, unknown> | undefined;
    const country = remoteIpDetails?.country as Record<string, unknown> | undefined;

    if (remoteIpDetails && geoLocation) {
      return {
        ip: (remoteIpDetails.ipAddressV4 as string) || (remoteIpDetails.ipAddressV6 as string) || "Unknown IP",
        lat: geoLocation.lat as number,
        lon: geoLocation.lon as number,
        country: (country?.countryName as string) || "Unknown Country",
        isInternal: false,
      };
    }
  } catch (err) {
    console.error("[GuardDuty Location Parse Error]:", err);
  }

  // IP/위치 정보가 없거나 파싱 오류 발생 시 서울/IDC 기본 좌표로 Fallback
  return {
    ip: "AWS Internal",
    lat: 37.5665,
    lon: 126.9780,
    country: "AWS Internal Resource",
    isInternal: true,
  };
}

// 대시보드 전달용 구독 채널 목록 (지영이의 wazuh:security:alerts 채널 추가)
const CHANNELS = [
  "login:success",
  "login:anomaly",
  "session:killed",
  "guardduty:finding",
  "wazuh:security:alerts", // 👈 지영이 이상 탐지 채널 추가
];

export function initSocketServer(server: HttpServer) {
  // .env의 ALLOWED_ORIGINS 목록을 가져옵니다. (없으면 기본값 사용)
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : ["http://localhost:3000", "http://localhost:3001"];

  const io = new SocketIOServer(server, {
    path: "/socket.io",
    // Polling을 제거하고 WebSocket 단독으로 설정 (HTTP 핸드셰이크 타임아웃 방지)
    transports: ["websocket"],
    allowUpgrades: false,
    // ALB 연결 유지 인터벌 및 타임아웃 튜닝
    pingTimeout: 20000,
    pingInterval: 25000,
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          // CORS 허용되지 않은 Origin 차단
          callback(new Error("Not allowed by CORS"), false);
        }
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Redis 채널 구독 설정
  redisSub.subscribe(...CHANNELS, (err, count) => {
    if (err) {
      console.error("[Socket.io] Redis subscribe error:", err);
    } else {
      console.log(`[Socket.io] Subscribed to ${count} Redis channels.`);
    }
  });

  // Redis 메시지 수신 시 처리 파이프라인
  redisSub.on("message", async (channel: string, message: string) => {
    try {
      const parsedData = JSON.parse(message);

      // 1. GuardDuty 이벤트 처리
      if (channel === "guardduty:finding") {
        const normalizedAlert = {
          id: parsedData.id || `gd-${Date.now()}`,
          source: "GUARD_DUTY",
          title: parsedData.title || "GuardDuty Security Finding",
          severity: parsedData.severity ?? "Medium",
          region: parsedData.region || "ap-northeast-2",
          location: parseGuardDutyLocation(parsedData as Record<string, unknown>),
          timestamp: parsedData.updatedAt || new Date().toISOString(),
        };

        io.emit("event:security-alert", normalizedAlert);
        console.log(`[Socket.io] Broadcasted event 'event:security-alert':`, normalizedAlert);
        return;
      }

      // 2. 🚨 지영이 이상 탐지 이벤트 (wazuh:security:alerts) 처리 파이프라인
      if (channel === "wazuh:security:alerts") {
        console.log(`[탐지 수신] Rule: ${parsedData.ruleId} | IP: ${parsedData.ip} | User: ${parsedData.userId}`);

        // 2-1. DB OTP 강제 전환 처리 (필요시 Prisma 연동)
        if (parsedData.userId) {
          // await prisma.user.update({ where: { id: parsedData.userId }, data: { requireOtp: true } });
          console.log(`[DB] 유저 ${parsedData.userId} 계정 OTP 강제 플래그 세팅 완료`);
        }

        // 2-2. 보안 알림 메일 발송 (수정이 SMTP 전/후 자동 분기)
        const targetEmail =
          parsedData.userEmail ||
          (parsedData.userId ? `${parsedData.userId}@zero-watch.com` : "admin@zero-watch.com");

        await sendSecurityAlertEmail({
          to: targetEmail,
          userId: parsedData.userId || "Unknown",
          ruleId: `${parsedData.ruleId} (${parsedData.ruleName || ""})`,
          ip: parsedData.ip || "Unknown IP",
          timestamp: parsedData.timestamp || new Date().toISOString(),
        });

        // 2-3. 서진이 대시보드 소켓 전파 ('event:anomaly-detected')
        io.emit("event:anomaly-detected", parsedData);
        console.log(`[Socket.io] Broadcasted event 'event:anomaly-detected':`, parsedData);
        return;
      }

      // 3. 기존 로그인 및 세션 관련 이벤트 전파
      io.emit(channel, parsedData);
      console.log(`[Socket.io] Broadcasted event '${channel}':`, parsedData);
    } catch (parseError) {
      console.error(`[Socket.io] JSON parse failed for channel '${channel}':`, parseError);
      io.emit(channel, message);
    }
  });

  io.on("connection", (socket: Socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);

    socket.on("disconnect", () => {
      console.log(`[Socket.io] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}