import crypto from "crypto";
import type { Server, Socket } from "socket.io";
import * as store from "../state/roomStore.js";
import type { RoomMember, FullRoomState, UserBrief } from "../types/room.js";
import type { SocketData } from "../types/events.js";
import { logger } from "../utils/logger.js";

const MAX_MEMBERS = 6;
const MAX_MEMBERS_FEATURED = 50;
const EMPTY_ROOM_TTL_MS = 3 * 60 * 1000; // 3 minutes

// Track empty-room cleanup timers
const emptyRoomTimers = new Map<string, NodeJS.Timeout>();

/** Start a 3-minute timer to delete an empty non-featured room. Cancelled if someone joins. */
export function startEmptyRoomTimer(roomId: string): void {
  clearEmptyRoomTimer(roomId);
  const timer = setTimeout(async () => {
    emptyRoomTimers.delete(roomId);
    const count = await store.getMemberCount(roomId);
    if (count === 0) {
      await store.deleteRoom(roomId);
      logger.info({ roomId }, "Room deleted (empty for 3 minutes)");
    }
  }, EMPTY_ROOM_TTL_MS);
  emptyRoomTimers.set(roomId, timer);
  logger.info({ roomId }, "Empty room timer started (3 min)");
}

export function clearEmptyRoomTimer(roomId: string): void {
  const existing = emptyRoomTimers.get(roomId);
  if (existing) {
    clearTimeout(existing);
    emptyRoomTimers.delete(roomId);
  }
}

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
    isFeatured: false,
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
  const cap = room.isFeatured ? MAX_MEMBERS_FEATURED : MAX_MEMBERS;
  if (count >= cap) return null;

  const member: RoomMember = {
    userId: socket.data.userId,
    username: socket.data.username,
    avatarUrl: socket.data.avatarUrl,
    side: null,
    isReady: false,
    joinedAt: Date.now(),
  };

  // Cancel empty-room cleanup timer if someone is joining
  clearEmptyRoomTimer(roomId);

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

  // If room is empty, start cleanup timer (featured rooms use their own inactivity timer)
  const room = await store.getRoom(roomId);
  if (room?.isFeatured) return;

  const count = await store.getMemberCount(roomId);
  if (count === 0) {
    startEmptyRoomTimer(roomId);
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

  // During lobby/side_pick, debaterAId/debaterBId aren't set on the room state yet,
  // so derive them from member side picks
  let debaterA = findUser(room.debaterAId);
  let debaterB = findUser(room.debaterBId);
  if (room.status === "lobby" || room.status === "side_pick") {
    const sideAMember = members.find((m) => m.side === "a");
    const sideBMember = members.find((m) => m.side === "b");
    if (sideAMember && !debaterA) {
      debaterA = { userId: sideAMember.userId, username: sideAMember.username, avatarUrl: sideAMember.avatarUrl };
    }
    if (sideBMember && !debaterB) {
      debaterB = { userId: sideBMember.userId, username: sideBMember.username, avatarUrl: sideBMember.avatarUrl };
    }
  }

  const featuredMeta = room.isFeatured ? await store.getFeaturedMeta(roomId) : null;

  return {
    roomId,
    status: room.status,
    topic: room.topic,
    sideALabel: room.sideALabel,
    sideBLabel: room.sideBLabel,
    members,
    debaterA,
    debaterB,
    phase,
    chat,
    debateId: room.debateId,
    votes: null,
    isFeatured: room.isFeatured,
    featuredMeta: featuredMeta ? {
      currentTopicIndex: featuredMeta.currentTopicIndex,
      debatesCompleted: featuredMeta.debatesCompleted,
      maxDebates: featuredMeta.maxDebates,
      topicCount: featuredMeta.topicQueue.length,
      closingAt: featuredMeta.closingAt,
    } : null,
  };
}
