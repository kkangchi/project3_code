import { redis } from "@/lib/redis";
import { blockIp } from "@/lib/blockIp";

const FAIL_THRESHOLD = 5;
const FAIL_WINDOW_SECONDS = 10 * 60; // 10분
const BLOCK_TTL_HOURS = 1;

function getFailKey(ip: string) {
  return `login_fail:${ip}`;
}

export async function recordLoginFailure(ip: string, reason: string) {
  const key = getFailKey(ip);
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, FAIL_WINDOW_SECONDS);
  }

  console.log(`[LOGIN_FAIL] IP: ${ip} | 사유: ${reason} | 카운트: ${count}/${FAIL_THRESHOLD}`);

  if (count >= FAIL_THRESHOLD) {
    try {
      const result = await blockIp(
        ip,
        `자동 차단: ${FAIL_WINDOW_SECONDS / 60}분 내 인증 실패 ${count}회 (${reason})`,
        BLOCK_TTL_HOURS
      );
      await redis.del(key);
      console.log(`[AUTO_BLOCK] ${ip} 자동 차단됨 (실패 ${count}회, 규칙 #${result.ruleNumber}, 만료 ${result.expiresAt.toISOString()})`);
    } catch (e) {
      console.error(`[AUTO_BLOCK] ${ip} 자동 차단 실패:`, e);
    }
  }
}

export async function resetLoginFailure(ip: string) {
  await redis.del(getFailKey(ip));
}