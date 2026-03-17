import type { Request, Response } from "express";
import { verifyToken } from "../auth/verifyToken.js";
import { supabase } from "../lib/supabase.js";
import * as roomStore from "../state/roomStore.js";
import { generateToken } from "./livekitService.js";
import { logger } from "../utils/logger.js";

export async function livekitTokenRoute(req: Request, res: Response): Promise<void> {
  const { roomId } = req.query;
  if (!roomId || typeof roomId !== "string") {
    res.status(400).json({ error: "roomId required" });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing token" });
    return;
  }

  try {
    const payload = await verifyToken(authHeader.slice(7));
    const userId = payload.sub;

    // Resolve username
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .single();

    const username =
      profile?.username ||
      payload.user_metadata?.username ||
      payload.email?.split("@")[0] ||
      "Anonymous";

    // Check room exists
    const room = await roomStore.getRoom(roomId);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }

    // Determine if this user is a debater and if it's currently their turn
    const isDebaterA = room.debaterAId === userId;
    const isDebaterB = room.debaterBId === userId;
    const isDebater = isDebaterA || isDebaterB;

    let canPublish = false;
    if (isDebater) {
      // If a phase is active, only allow publish if it's their turn
      const phase = await roomStore.getPhase(roomId);
      if (phase) {
        const userSide = isDebaterA ? "a" : "b";
        canPublish = phase.speaker === userSide;
      }
    }

    const token = await generateToken(roomId, userId, username, canPublish);

    logger.info({ userId, roomId, isDebater, canPublish }, "LiveKit token issued");
    res.json({ token, isDebater, canPublish });
  } catch (err) {
    logger.warn({ err }, "LiveKit token request failed");
    res.status(401).json({ error: "Unauthorized" });
  }
}
