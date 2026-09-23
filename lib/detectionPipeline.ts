import Redis from "ioredis";
import { sendSecurityAlertEmail } from "@/lib/mailer";
import type { Server as SocketIOServer } from "socket.io";

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

    // 메시지 수신 리스너 1회만 등록
    detectionSub.on("message", async (channel: string, message: string) => {
      if (channel !== "wazuh:security:alerts") return;

      try {
        const data = JSON.parse(message);
        console.log(`[탐지 수신] Rule: \({data.ruleId} | IP:\){data.ip} | User: ${data.userId}`);

        if (data.userId) {
          console.log(`[DB] 유저 '${data.userId}' 계정 OTP 강제 플래그 세팅`);
        }

        const targetEmail =
          data.userEmail ||
          (data.userId ? `${data.userId}@zero-watch.com` : "admin@zero-watch.com");

        const formattedRuleId = data.ruleName ? `\({data.ruleId} (\){data.ruleName})` : data.ruleId;

        await sendSecurityAlertEmail({
          to: targetEmail,
          userId: data.userId || "Unknown (IP-based)",
          ruleId: formattedRuleId,
          ip: data.ip || "Unknown IP",
          timestamp: data.timestamp || new Date().toISOString(),
        });

        io.emit("event:anomaly-detected", data);
        console.log(`[Socket.io] 'event:anomaly-detected' 브로드캐스트 전달 완료`);

      } catch (err) {
        console.error("[탐지 파이프라인] 이벤트 처리 중 에러 발생:", err);
      }
    });
  }

  const CHANNEL = "wazuh:security:alerts";

  if (!isSubscribed) {
    detectionSub.connect().then(() => {
      detectionSub?.subscribe(CHANNEL, (err) => {
        if (err) {
          console.error(`[탐지 파이프라인] '${CHANNEL}' 채널 구독 실패:`, err);
        } else {
          isSubscribed = true;
          console.log(`[탐지 파이프라인] '${CHANNEL}' 채널 구독 시작 완료`);
        }
      });
    }).catch((err) => {
      console.error(`[탐지 파이프라인] Redis 연결 초기화 실패:`, err);
    });
  }
}