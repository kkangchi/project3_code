import Redis from "ioredis";
import { prisma } from "@/lib/prisma";
import { sendSecurityAlertEmail } from "@/lib/mailer";
import type { Server as SocketIOServer } from "socket.io";

interface WazuhAlertData {
  ruleId: string;
  ruleName?: string;
  severity?: number;
  timestamp?: string;
  ip?: string;
  userId?: string | null;
  userEmail?: string;
  country?: string;
  message?: string;
  [key: string]: unknown;
}

let detectionSub: Redis | null = null;
let isSubscribed = false;

export function initDetectionPipeline(io: SocketIOServer) {
  console.log("[DEBUG] initDetectionPipeline 함수 호출됨");

  const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
  console.log(`[DEBUG] 탐지 파이프라인 REDIS_URL: "${REDIS_URL}"`);

  if (!detectionSub) {
    detectionSub = new Redis(REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
      retryStrategy(times) {
        return Math.min(times * 50, 2000);
      },
    });

    detectionSub.on("connect", () => {
      console.log("[탐지 파이프라인] Redis Sub 클라이언트 연결 성공.");
    });

    detectionSub.on("error", (err) => {
      console.error("[탐지 파이프라인 Redis Sub 에러]:", err);
    });

    detectionSub.on("message", async (channel: string, message: string) => {
      if (channel !== "wazuh:security:alerts") return;

      let data: WazuhAlertData;
      try {
        data = JSON.parse(message) as WazuhAlertData;
        console.log(`[탐지 수신] Rule: ${data.ruleId} | IP: ${data.ip} | User: ${data.userId}`);
      } catch (err) {
        console.error("[탐지 파이프라인] JSON 파싱 에러:", err);
        return;
      }

      // 1. userId가 있으면 실제 DB에서 해당 계정을 HIGH 프로파일로 강제 전환 (OTP 필수화)
      if (data.userId) {
        try {
          await prisma.user.update({
            where: { id: data.userId },
            data: { profile: "HIGH" },
          });
          console.log(`[DB] 유저 '${data.userId}' 계정 HIGH 프로파일로 강제 전환 완료`);
        } catch (dbErr) {
          console.error(`[탐지 파이프라인] 유저 '${data.userId}' DB 업데이트 실패 (계정 없거나 ID 불일치 가능):`, dbErr);
        }
      }

      // 2. 보안 알림 메일 발송 (실패해도 아래 소켓 전달에 영향 없도록 격리)
      try {
        const targetEmail =
          data.userEmail ||
          (data.userId ? `${data.userId}@zero-watch.com` : "admin@zero-watch.com");
        const formattedRuleId = data.ruleName ? `${data.ruleId} (${data.ruleName})` : data.ruleId;

        await sendSecurityAlertEmail({
          to: targetEmail,
          userId: data.userId || "Unknown (IP-based)",
          ruleId: formattedRuleId,
          ip: data.ip || "Unknown IP",
          timestamp: data.timestamp || new Date().toISOString(),
        });
      } catch (mailErr) {
        console.error("[탐지 파이프라인] 메일 발송 단계 실패 (무시하고 계속 진행):", mailErr);
      }

      // 3. 대시보드로 소켓 전달
      try {
        io.emit("event:anomaly-detected", data);
        console.log(`[Socket.io] 'event:anomaly-detected' 브로드캐스트 전달 완료`);
      } catch (socketErr) {
        console.error("[탐지 파이프라인] 소켓 전달 실패:", socketErr);
      }
    });
  }

  const CHANNEL = "wazuh:security:alerts";

  if (!isSubscribed) {
    detectionSub
      .connect()
      .then(() => {
        detectionSub?.subscribe(CHANNEL, (err) => {
          if (err) {
            console.error(`[탐지 파이프라인] '${CHANNEL}' 채널 구독 실패:`, err);
          } else {
            isSubscribed = true;
            console.log(`[탐지 파이프라인] '${CHANNEL}' 채널 구독 시작 완료`);
          }
        });
      })
      .catch((err) => {
        console.error(`[탐지 파이프라인] Redis 연결 초기화 실패:`, err);
      });
  }
}