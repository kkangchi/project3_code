import path from "path";
import dotenv from "dotenv";

const envPath = path.resolve(__dirname, "./.env");
console.log(`[DEBUG] __dirname 값: "${__dirname}"`);
console.log(`[DEBUG] .env 탐색 경로: "${envPath}"`);

const envConfig = dotenv.config({ path: envPath });
if (envConfig.error) {
  console.error("[DEBUG] .env 로드 실패 에러:", envConfig.error);
} else {
  console.log("[DEBUG] .env 로드 성공. 로드된 키 목록:", Object.keys(envConfig.parsed || {}));
}

import { createServer, Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import Redis from "ioredis";
import next from "next";

import { initDetectionPipeline } from "./lib/detectionPipeline";

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
console.log(`[DEBUG] REDIS_URL 값 확인: "${REDIS_URL}"`);

const redisSub = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redisSub.on("connect", () => {
  console.log("[Redis Sub] Connected to Redis successfully.");
});

redisSub.on("error", (err) => {
  console.error("[Redis Sub Error]:", err);
});

// Record 대신 인덱스 시그니처({ [key: string]: unknown }) 사용
function parseGuardDutyLocation(finding: { [key: string]: unknown }) {
  try {
    const service = finding.service as { [key: string]: unknown } | undefined;
    const action = service?.action as { [key: string]: unknown } | undefined;

    const networkConnectionAction = action?.networkConnectionAction as { [key: string]: unknown } | undefined;
    const awsApiCallAction = action?.awsApiCallAction as { [key: string]: unknown } | undefined;

    const remoteIpDetails = (networkConnectionAction?.remoteIpDetails || awsApiCallAction?.remoteIpDetails) as { [key: string]: unknown } | undefined;
    const geoLocation = remoteIpDetails?.geoLocation as { [key: string]: unknown } | undefined;
    const country = remoteIpDetails?.country as { [key: string]: unknown } | undefined;

    if (remoteIpDetails && geoLocation) {
      return {
        ip: (remoteIpDetails.ipAddressV4 as string) || (remoteIpDetails.ipAddressV6 as string) || "Unknown IP",
        lat: geoLocation.lat as number,
        lon: geoLocation.lon as number,
        country: (country?.countryName as string) || "Unknown Country",
        isInternal: false,
      };
    }
  } catch (err) {
    console.error("[GuardDuty Location Parse Error]:", err);
  }

  return {
    ip: "AWS Internal",
    lat: 37.5665,
    lon: 126.9780,
    country: "AWS Internal Resource",
    isInternal: true,
  };
}

const CHANNELS = ["login:success", "login:anomaly", "session:killed", "guardduty:finding"];

export function initSocketServer(server: HttpServer): SocketIOServer {
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : ["http://localhost:3000", "http://localhost:3001"];

  const io = new SocketIOServer(server, {
    path: "/socket.io",
    addTrailingSlash: false,
    transports: ["polling", "websocket"],
    allowUpgrades: true,
    pingTimeout: 20000,
    pingInterval: 25000,
    cors: {
      origin: (origin, callback) => {
        if (!origin) {
          return callback(null, true);
        }
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        console.warn(`[CORS Blocked] Unallowed origin attempted connection: ${origin}`);
        return callback(new Error("CORS policy violation: Origin not allowed"));
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  redisSub.connect().catch((err) => {
    console.error("[Redis Sub Initial Connect Error]:", err);
  });

  redisSub.subscribe(...CHANNELS, (err, count) => {
    if (err) {
      console.error("[Socket.io] Redis subscribe error:", err);
    } else {
      console.log(`[Socket.io] Subscribed to ${count} Redis channels.`);
    }
  });

  redisSub.on("message", (channel: string, message: string) => {
    try {
      const parsedData = JSON.parse(message);

      if (channel === "guardduty:finding") {
        const normalizedAlert = {
          id: parsedData.id || `gd-${Date.now()}`,
          source: "GUARD_DUTY",
          title: parsedData.title || "GuardDuty Security Finding",
          severity: parsedData.severity ?? "Medium",
          region: parsedData.region || "ap-northeast-2",
          location: parseGuardDutyLocation(parsedData as { [key: string]: unknown }),
          timestamp: parsedData.updatedAt || new Date().toISOString(),
        };

        io.emit("event:security-alert", normalizedAlert);
        console.log(`[Socket.io] Broadcasted event 'event:security-alert':`, normalizedAlert);
        return;
      }

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

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  console.log('[DEBUG] Redis 연결 완료 후 initSocketServer 호출 직전');
  const io = initSocketServer(httpServer);
  console.log('[DEBUG] initSocketServer 반환됨');

  initDetectionPipeline(io);
  console.log('[DEBUG] initDetectionPipeline 파이프라인 연결 완료');

  httpServer.listen(port, () => {
    console.log(`[DEBUG] listen 콜백 진입 — Ready on port ${port}`);
  });
}).catch((err) => {
  console.error('[Server Preparation Error]:', err);
});