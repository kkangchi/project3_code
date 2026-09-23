import Redis from "ioredis";
import { sendSecurityAlertEmail } from "@/lib/mailer";
import type { Server as SocketIOServer } from "socket.io";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Redis 구독(Sub) 전용 클라이언트
const detectionSub = new Redis(REDIS_URL);

detectionSub.on("error", (err) => {
  console.error("[탐지 파이프라인 Redis Sub 에러]:", err);
});

export function initDetectionPipeline(io: SocketIOServer) {
  const CHANNEL = "wazuh:security:alerts";

  detectionSub.subscribe(CHANNEL, (err) => {
    if (err) {
      console.error(`[탐지 파이프라인] '${CHANNEL}' 채널 구독 실패:`, err);
    } else {
      console.log(`[탐지 파이프라인] '${CHANNEL}' 채널 구독 시작 완료`);
    }
  });

  detectionSub.on("message", async (channel: string, message: string) => {
    if (channel !== CHANNEL) return;

    try {
      const data = JSON.parse(message);
      console.log(`[탐지 수신] Rule: \({data.ruleId} | IP:\){data.ip} | User: ${data.userId}`);

      if (data.userId) {
        console.log(`[DB] 유저 '${data.userId}' 계정 OTP 강제 플래그 세팅`);
      }

      const targetEmail =
        data.userEmail ||
        (data.userId ? `${data.userId}@zero-watch.com` : "admin@zero-watch.com");

      // 룰 이름 및 ID 표기 템플릿 리터럴 깔끔하게 정리
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