import { redis } from '@/lib/redis';

const CACHE_TTL_SECONDS = 60 * 60; // 1시간

export async function getCountryByIpCached(ip: string): Promise<string> {
  if (ip === '127.0.0.1' || ip.startsWith('10.') || ip.startsWith('192.168.')) {
    return 'UNKNOWN';
  }

  const cacheKey = `geoip:${ip}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return cached;
    }
  } catch (e) {
    console.error('GeoIP 캐시 조회 실패:', e);
  }

  let country = 'UNKNOWN';
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`);
    const text = await res.text();
    if (text) {
      const data = JSON.parse(text);
      country = data.countryCode || 'UNKNOWN';
    }
  } catch (error) {
    console.error('GeoIP lookup error:', error);
  }

  try {
    await redis.set(cacheKey, country, 'EX', CACHE_TTL_SECONDS);
  } catch (e) {
    console.error('GeoIP 캐시 저장 실패:', e);
  }

  return country;
}