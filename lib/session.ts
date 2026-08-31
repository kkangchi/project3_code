import crypto from "crypto";
import jwt from "jsonwebtoken";
import { redis, getSessionKey, getUserSessionsKey } from "@/lib/redis";

const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

interface CreateSessionParams {
  userId: string;
  email: string;
  role: string;
  ipAddress: string;
  userAgent?: string;
}

export async function createSession({ userId, email, role, ipAddress, userAgent }: CreateSessionParams){
  const sessionId = crypto.randomUUID();
  const sessionKey = getSessionKey(sessionId);
  const userSessionsKey = getUserSessionsKey(userId);

  const sessionData = {
    sessionId,
    userId,
    email,
    role, // role 필드 정상 포함
    ipAddress,
    userAgent: userAgent || "Unknown",
    createdAt: new Date().toISOString(),
  };

  // 세션 저장 (JWT 만료시간과 동일하게 24시간)
  await redis.set(sessionKey, JSON.stringify(sessionData), "EX", 60 * 60 * 24);
  await redis.sadd(userSessionsKey, sessionId);

  const token = jwt.sign({ userId, email, role, sessionId }, JWT_SECRET, { expiresIn: "1d" });

  return { token, sessionId };
}