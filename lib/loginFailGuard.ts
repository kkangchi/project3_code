import { redis } from "@/lib/redis";
import { blockIp } from "@/lib/blockIp";

const FAIL_THRESHOLD = 5;
const FAIL_WINDOW_SECONDS = 10 * 60; // 10분
const BLOCK_TTL_HOURS = 1;

function getFailKey(ip: string) {
  return `login_fail:${ip}`;
}

export async function recordLoginFailure(ip: string, reason: string) {
  // ================================================
  // 🐛 DEBUG: 함수 진입 확인
  // ================================================
  console.log(`\n========== [LOGIN_FAIL_DEBUG] recordLoginFailure 호출됨 ==========`);
  console.log(`[LOGIN_FAIL_DEBUG] IP: ${ip}`);
  console.log(`[LOGIN_FAIL_DEBUG] 실패 사유: ${reason}`);
  console.log(`====================================================================\n`);

  const key = getFailKey(ip);

  let count: number;
  try {
    // ================================================
    // 🐛 DEBUG: redis.incr() 호출 직전/직후
    // ================================================
    console.log(`[LOGIN_FAIL_DEBUG] redis.incr("${key}") 호출 시도...`);
    count = await redis.incr(key);
    console.log(`[LOGIN_FAIL_DEBUG] ✅ redis.incr() 성공! 현재 카운트: ${count}`);
  } catch (e) {
    // ================================================
    // 🐛 DEBUG: redis.incr() 자체가 실패하는 경우 (원래 코드엔 없던 catch)
    // ================================================
    console.error(`[LOGIN_FAIL_DEBUG] ❌ redis.incr() 실패!`, e);
    return; // 카운트 자체가 안 됐으니 여기서 종료
  }

  if (count === 1) {
    console.log(`[LOGIN_FAIL_DEBUG] 첫 실패 감지, TTL ${FAIL_WINDOW_SECONDS}초 설정`);
    await redis.expire(key, FAIL_WINDOW_SECONDS);
  }

  // ================================================
  // 🐛 DEBUG: 임계치 도달 여부 판단 직전
  // ================================================
  console.log(`[LOGIN_FAIL_DEBUG] 임계치 체크: 현재 ${count}회 / 기준 ${FAIL_THRESHOLD}회`);

  if (count >= FAIL_THRESHOLD) {
    console.log(`[LOGIN_FAIL_DEBUG] 🚨 임계치 도달! blockIp() 호출 시도...`);
    try {
      const result = await blockIp(
        ip,
        `자동 차단: ${FAIL_WINDOW_SECONDS / 60}분 내 인증 실패 ${count}회 (${reason})`,
        BLOCK_TTL_HOURS
      );
      // ================================================
      // 🐛 DEBUG: blockIp() 성공 시 실제 반환값 확인
      // ================================================
      console.log(`[LOGIN_FAIL_DEBUG] ✅ blockIp() 성공! 결과:`, result);

      await redis.del(key);
      console.log(`[AUTO_BLOCK] ${ip} 자동 차단됨 (실패 ${count}회)`);
    } catch (e) {
      // ================================================
      // 🐛 DEBUG: blockIp() 실패 시 정확한 에러 내용 (기존에도 있었지만 강조)
      // ================================================
      console.error(`\n########## [AUTO_BLOCK] 자동 차단 실패! ##########`);
      console.error(e);
      console.error(`###################################################\n`);
    }
  } else {
    console.log(`[LOGIN_FAIL_DEBUG] 아직 임계치 미달, 대기 중...`);
  }
}

export async function resetLoginFailure(ip: string) {
  console.log(`[LOGIN_FAIL_DEBUG] resetLoginFailure 호출됨. IP: ${ip}`);
  await redis.del(getFailKey(ip));
}