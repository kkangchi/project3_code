import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
console.log(`[DEBUG] REDIS_URL 값 확인: "${REDIS_URL}"`);

const redisSub = new Redis(REDIS_URL);

// 대시보드 전달용 구독 채널 목록
const CHANNELS = ["login:success", "login:anomaly", "session:killed"];

export function initSocketServer(server: HttpServer) {
  const io = new SocketIOServer(server, {
    path: "/socket.io", // 슬래시(/) 제거: 표준 Socket.io path 규격
    cors: {
      origin: (origin, callback) => {
        const allowedOrigins = ["http://localhost:3000", "http://localhost:3001"];
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(null, true); // 개발 환경 편의를 위한 전체 허용
        }
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Redis 채널 구독 설정
  redisSub.subscribe(...CHANNELS, (err, count) => {
    if (err) {
      console.error("[Socket.io] Redis subscribe error:", err);
    } else {
      console.log(`[Socket.io] Subscribed to ${count} Redis channels.`);
    }
  });

  // Redis 메시지 수신 시 대시보드로 Socket.io 브로드캐스트
  redisSub.on("message", (channel: string, message: string) => {
    try {
      const parsedData = JSON.parse(message);
      io.emit(channel, parsedData);
      console.log(`[Socket.io] Broadcasted event '${channel}':`, parsedData);
    } catch (parseError) {
      console.error(`[Socket.io] JSON parse failed for channel '${channel}':`, parseError);
      io.emit(channel, message);
    }
  });

  io.on("connection", (socket: Socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);

    socket.on("disconnect", () => {
      console.log(`[Socket.io] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}