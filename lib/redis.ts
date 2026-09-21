import Redis from 'ioredis';

// .env에 설정된 REDIS_URL을 우선 사용하고, 없을 경우에만 기본값 사용
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// 메인 Redis 클라이언트
export const redis = new Redis(REDIS_URL);

// Pub/Sub 전용 Redis 클라이언트 (이벤트 발행용)
export const redisPub = new Redis(REDIS_URL);

// Redis 접속 에러 핸들러 (unhandled error 방지)
redis.on('error', (err) => console.error('[Redis Error]:', err));
redisPub.on('error', (err) => console.error('[Redis Pub Error]:', err));

// sessionId만으로 세션 조회 가능한 키 구조
export const getSessionKey = (sessionId: string) => `session:${sessionId}`;
export const getUserSessionsKey = (userId: string) => `user_sessions:${userId}`;

/**
 * sessionId 기준 단일 세션 파기
 * userId는 파기 직전 Redis에 저장된 세션 데이터에서 추출
 */
export async function revokeSession(sessionId: string, reason: string = "ADMIN_REVOKE"){
  const sessionKey = getSessionKey(sessionId);
  const rawData = await redis.get(sessionKey);

  let userId: string | null = null;
  if (rawData) {
    try {
      userId = JSON.parse(rawData).userId || null;
    } catch {
      userId = null;
    }
  }

  await redis.del(sessionKey);

  if (userId) {
    await redis.srem(getUserSessionsKey(userId), sessionId);
  }

  await redisPub.publish(
    "session:killed",
    JSON.stringify({ userId, sessionId, reason, timestamp: new Date().toISOString() })
  );

  return { success: true, userId };
}

/**
 * [스텝3] 지영이 이상 탐지 이벤트를 Redis 채널('wazuh:security:alerts')로 발행(Publish)하는 함수
 */
export async function publishAnomalyAlert(alertData: {
  userId?: string;
  userEmail?: string;
  ruleId: string;
  ruleName?: string;
  ip?: string;
  timestamp?: string;
  [key: string]: unknown;
}){
  try {
    const channel = "wazuh:security:alerts";
    const payload = JSON.stringify({
      ...alertData,
      timestamp: alertData.timestamp || new Date().toISOString(),
    });

    await redisPub.publish(channel, payload);
    console.log(`[Redis Pub] Published alert to '${channel}':`, alertData.ruleId);
    return { success: true };
  } catch (error) {
    console.error("[Redis Pub Error] Failed to publish alert:", error);
    return { success: false, error };
  }
}