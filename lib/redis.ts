import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(REDIS_URL);
export const redisPub = new Redis(REDIS_URL);

redis.on('error', (err) => console.error('[Redis Error]:', err));
redisPub.on('error', (err) => console.error('[Redis Pub Error]:', err));

export const getSessionKey = (sessionId: string) => `session:${sessionId}`;
export const getUserSessionsKey = (userId: string) => `user_sessions:${userId}`;

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

// Record 대신 인덱스 시그니처({ [key: string]: unknown }) 사용
export async function publishAnomalyAlert(alertData: {
  ruleId: string;
  wazuhRuleId?: string;
  ruleName?: string;
  severity?: number;
  timestamp?: string;
  source?: string;
  ip?: string;
  userId?: string | null;
  userEmail?: string | null;
  country?: string | null;
  message?: string;
  details?: { [key: string]: unknown };
  [key: string]: unknown;
}) {
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