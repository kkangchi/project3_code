import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Redis Subscriber 인스턴스 생성
const redisSub = new Redis(REDIS_URL);

// 대시보드 전달용 구독 채널 목록
const CHANNELS = ["login:success", "login:anomaly", "session:killed"];

export function initSocketServer(server: HttpServer) {
  const io = new SocketIOServer(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
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
      console.log(`[Socket.io] Broadcasted raw event '${channel}':`, message);
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