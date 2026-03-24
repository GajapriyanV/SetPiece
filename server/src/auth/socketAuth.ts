import type { Socket } from "socket.io";
import { verifyToken } from "./verifyToken.js";
import { supabase } from "../lib/supabase.js";
import { redis } from "../lib/redis.js";
import { logger } from "../utils/logger.js";
import type { SocketData } from "../types/events.js";

export async function socketAuth(
  socket: Socket & { data: SocketData },
  next: (err?: Error) => void
) {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("NO_TOKEN"));

  try {
    const payload = await verifyToken(token);

    socket.data.userId = payload.sub;
    socket.data.roomId = null;

    // Try to get username from profiles table, fall back to token metadata
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, avatar_url")
      .eq("id", payload.sub)
      .single();

    socket.data.username =
      profile?.username ||
      payload.user_metadata?.username ||
      payload.email?.split("@")[0] ||
      "Anonymous";

    socket.data.avatarUrl = profile?.avatar_url || null;

    // Warm the Redis profile cache so joinRoom can read fresh data without a DB query
    redis.set(
      `sp:profile:${payload.sub}`,
      JSON.stringify({ username: socket.data.username, avatarUrl: socket.data.avatarUrl }),
      { ex: 86400 }
    );

    logger.info({ userId: socket.data.userId, username: socket.data.username }, "Socket authenticated");
    next();
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn({ err, errMsg, tokenPrefix: token?.slice(0, 20) }, "Socket auth failed");
    next(new Error("INVALID_TOKEN: " + errMsg));
  }
}
