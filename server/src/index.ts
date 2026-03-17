import { env } from "./config/env.js";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { socketAuth } from "./auth/socketAuth.js";
import { registerHandlers } from "./handlers/registerHandlers.js";
import { logger } from "./utils/logger.js";
import * as roomStore from "./state/roomStore.js";
import { livekitTokenRoute } from "./livekit/tokenRoute.js";
import { livekitSyncRoute } from "./livekit/syncRoute.js";
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from "./types/events.js";

const app = express();
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// LiveKit token + permission sync
app.get("/api/livekit/token", livekitTokenRoute);
app.get("/api/livekit/sync", livekitSyncRoute);

// Room listing API
app.get("/api/rooms", async (_req, res) => {
  try {
    const roomIds = await roomStore.getActiveRoomIds();
    const rooms = await Promise.all(
      roomIds.map(async (id) => {
        const room = await roomStore.getRoom(id);
        const memberCount = await roomStore.getMemberCount(id);
        if (!room) return null;
        return {
          roomId: id,
          topic: room.topic,
          sideALabel: room.sideALabel,
          sideBLabel: room.sideBLabel,
          status: room.status,
          memberCount,
        };
      })
    );
    res.json(rooms.filter(Boolean));
  } catch (err) {
    logger.error({ err }, "Failed to list rooms");
    res.status(500).json({ error: "Failed to list rooms" });
  }
});

const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
  cors: {
    origin: env.CORS_ORIGIN,
    methods: ["GET", "POST"],
  },
});

// Auth middleware
io.use(socketAuth as Parameters<typeof io.use>[0]);

io.on("connection", (socket) => {
  logger.info({ userId: socket.data.userId, username: socket.data.username }, "Client connected");
  registerHandlers(io as unknown as Server, socket as unknown as Parameters<typeof registerHandlers>[1]);
});

httpServer.listen(env.PORT, () => {
  logger.info({ port: env.PORT, cors: env.CORS_ORIGIN }, "SetPiece server running");
});

// Graceful shutdown
const shutdown = async () => {
  logger.info("Shutting down...");
  io.close();
  httpServer.close();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
