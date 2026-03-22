import crypto from "crypto";
import type { Server, Socket } from "socket.io";
import * as store from "../state/roomStore.js";
import type { SocketData } from "../types/events.js";
import { emitError } from "../utils/errors.js";

// Simple rate limiting: track last message time per user
const lastMessageTime = new Map<string, number>();

const MAX_LENGTH = 280;
const MIN_INTERVAL_MS = 1000; // 1 message per second

export async function handleChatSend(
  socket: Socket & { data: SocketData },
  io: Server,
  body: string
): Promise<void> {
  const roomId = socket.data.roomId;
  if (!roomId) return emitError(socket, "NOT_IN_ROOM", "You are not in a room");

  // Validate
  const trimmed = body.trim();
  if (!trimmed) return;
  if (trimmed.length > MAX_LENGTH) {
    return emitError(socket, "MSG_TOO_LONG", `Message exceeds ${MAX_LENGTH} characters`);
  }

  // Rate limit
  const now = Date.now();
  const last = lastMessageTime.get(socket.data.userId);
  if (last && now - last < MIN_INTERVAL_MS) {
    return;
  }
  lastMessageTime.set(socket.data.userId, now);

  const message = {
    id: crypto.randomUUID(),
    userId: socket.data.userId,
    username: socket.data.username,
    body: trimmed,
    createdAt: new Date().toISOString(),
  };

  await store.addChatMessage(roomId, message);
  io.to(roomId).emit("chat:message", message);
}
