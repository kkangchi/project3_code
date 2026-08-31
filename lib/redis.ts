import Redis from 'ioredis';

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD,
};

// 메인 Redis 클라이언트
export const redis = new Redis(redisConfig);

// Pub/Sub 전용 Redis 클라이언트 (이벤트 발행용)
export const redisPub = new Redis(redisConfig);

// sessionId만으로 세션 조회 가능한 키 구조
export const getSessionKey = (sessionId: string) => `session:${sessionId}`;
export const getUserSessionsKey = (userId: string) => `user_sessions:${userId}`;

/**
 * sessionId 기준 단일 세션 파기
 * userId는 파기 직전 Redis에 저장된 세션 데이터에서 추출
 */
export async function revokeSession(sessionId: string, reason: string = "ADMIN_REVOKE") {
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