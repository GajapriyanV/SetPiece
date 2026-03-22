import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const httpUrl = env.LIVEKIT_URL.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");

const roomService = new RoomServiceClient(
  httpUrl,
  env.LIVEKIT_API_KEY,
  env.LIVEKIT_API_SECRET
);

export async function generateToken(
  roomId: string,
  userId: string,
  username: string,
  canPublish: boolean
): Promise<string> {
  const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: userId,
    name: username,
    ttl: "4h",
  });

  token.addGrant({
    room: roomId,
    roomJoin: true,
    canPublish,
    canSubscribe: true,
  });

  return await token.toJwt();
}

export async function closeLiveKitRoom(roomId: string): Promise<void> {
  try {
    await roomService.deleteRoom(roomId);
    logger.info({ roomId }, "LiveKit room deleted");
  } catch (err) {
    logger.warn({ roomId, err }, "LiveKit deleteRoom failed (may already be closed)");
  }
}

export async function setCanPublish(
  roomId: string,
  identity: string,
  canPublish: boolean
): Promise<void> {
  try {
    await roomService.updateParticipant(roomId, identity, {
      permission: {
        canPublish,
        canSubscribe: true,
      },
    });
    logger.info({ roomId, identity, canPublish }, "LiveKit permissions updated");
  } catch (err) {
    // Participant may not be in LiveKit room yet — non-fatal
    logger.warn({ roomId, identity, err }, "LiveKit setCanPublish failed (participant may not be connected)");
  }
}
