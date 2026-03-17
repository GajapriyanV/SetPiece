import crypto from "crypto";
import type { Server, Socket } from "socket.io";
import * as store from "../state/roomStore.js";
import type { RoomMember, FullRoomState, UserBrief } from "../types/room.js";
import type { SocketData } from "../types/events.js";
import { logger } from "../utils/logger.js";

const MAX_MEMBERS = 6;

export function generateRoomId(): string {
  return crypto.randomBytes(4).toString("hex");
}

export async function createRoom(
  topic: string,
  sideALabel: string,
  sideBLabel: string
): Promise<string> {
  const roomId = generateRoomId();
  await store.createRoom(roomId, {
    status: "lobby",
    topic,
    sideALabel,
    sideBLabel,
    debaterAId: null,
    debaterBId: null,
    debateId: null,
    createdAt: Date.now(),
  });
  logger.info({ roomId, topic }, "Room created");
  return roomId;
}

export async function joinRoom(
  roomId: string,
  socket: Socket & { data: SocketData },
  io: Server
): Promise<FullRoomState | null> {
  const room = await store.getRoom(roomId);
  if (!room) return null;

  const count = await store.getMemberCount(roomId);
  if (count >= MAX_MEMBERS) return null;

  const member: RoomMember = {
    userId: socket.data.userId,
    username: socket.data.username,
    avatarUrl: socket.data.avatarUrl,
    side: null,
    isReady: false,
    joinedAt: Date.now(),
  };

  await store.addMember(roomId, member);
  socket.data.roomId = roomId;
  socket.join(roomId);

  // Notify others
  socket.to(roomId).emit("room:member_joined", {
    userId: member.userId,
    username: member.username,
    avatarUrl: member.avatarUrl,
  });

  return getFullRoomState(roomId);
}

export async function leaveRoom(
  socket: Socket & { data: SocketData },
  io: Server
): Promise<void> {
  const roomId = socket.data.roomId;
  if (!roomId) return;

  await store.removeMember(roomId, socket.data.userId);
  socket.leave(roomId);
  socket.data.roomId = null;

  // Notify others
  io.to(roomId).emit("room:member_left", { userId: socket.data.userId });

  // If room is empty, delete it
  const count = await store.getMemberCount(roomId);
  if (count === 0) {
    await store.deleteRoom(roomId);
    logger.info({ roomId }, "Room deleted (empty)");
  }
}

export async function getFullRoomState(roomId: string): Promise<FullRoomState | null> {
  const room = await store.getRoom(roomId);
  if (!room) return null;

  const members = await store.getMembers(roomId);
  const phase = await store.getPhase(roomId);
  const chat = await store.getChatHistory(roomId);

  const findUser = (id: string | null): UserBrief | null => {
    if (!id) return null;
    const m = members.find((m) => m.userId === id);
    return m ? { userId: m.userId, username: m.username, avatarUrl: m.avatarUrl } : null;
  };

  return {
    roomId,
    status: room.status,
    topic: room.topic,
    sideALabel: room.sideALabel,
    sideBLabel: room.sideBLabel,
    members,
    debaterA: findUser(room.debaterAId),
    debaterB: findUser(room.debaterBId),
    phase,
    chat,
    debateId: room.debateId,
    votes: null,
  };
}
