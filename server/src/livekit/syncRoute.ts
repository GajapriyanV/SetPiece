import type { Request, Response } from "express";
import { verifyToken } from "../auth/verifyToken.js";
import * as roomStore from "../state/roomStore.js";
import { setCanPublish } from "./livekitService.js";
import { logger } from "../utils/logger.js";

/**
 * GET /api/livekit/sync?roomId=X
 * Called by the client after a LiveKit reconnect to re-apply server-side
 * phase permissions. LiveKit can reset permissions to the original JWT values
 * on reconnect, so we need to push the correct state again.
 */
export async function livekitSyncRoute(req: Request, res: Response): Promise<void> {
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

    const room = await roomStore.getRoom(roomId);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }

    const isDebaterA = room.debaterAId === userId;
    const isDebaterB = room.debaterBId === userId;
    const isDebater = isDebaterA || isDebaterB;

    let canPublish = false;
    if (isDebater) {
      const phase = await roomStore.getPhase(roomId);
      if (phase) {
        const userSide = isDebaterA ? "a" : "b";
        canPublish = phase.speaker === userSide;
      }
    }

    // Re-apply the correct LiveKit permission for this participant
    if (isDebater) {
      await setCanPublish(roomId, userId, canPublish);
    }

    logger.info({ userId, roomId, canPublish }, "LiveKit permissions synced on reconnect");
    res.json({ canPublish });
  } catch (err) {
    logger.warn({ err }, "LiveKit sync failed");
    res.status(401).json({ error: "Unauthorized" });
  }
}
