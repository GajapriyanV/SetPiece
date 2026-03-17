import type { Server, Socket } from "socket.io";
import * as store from "../state/roomStore.js";
import type { Side, UserBrief, RoomMember } from "../types/room.js";
import type { SocketData } from "../types/events.js";
import { emitError } from "../utils/errors.js";

export async function pickSide(
  socket: Socket & { data: SocketData },
  io: Server,
  side: Side
): Promise<void> {
  const roomId = socket.data.roomId;
  if (!roomId) return emitError(socket, "NOT_IN_ROOM", "You are not in a room");

  const room = await store.getRoom(roomId);
  if (!room) return;
  if (room.status !== "lobby" && room.status !== "side_pick") {
    return emitError(socket, "INVALID_STATE", "Cannot pick side in current state");
  }

  const members = await store.getMembers(roomId);

  // Check if side is already taken by someone else
  const taken = members.find((m) => m.side === side && m.userId !== socket.data.userId);
  if (taken) {
    return emitError(socket, "SIDE_TAKEN", `Side ${side.toUpperCase()} is already taken`);
  }

  await store.updateMember(roomId, socket.data.userId, { side, isReady: false });

  await broadcastSides(roomId, io);
}

export async function unpickSide(
  socket: Socket & { data: SocketData },
  io: Server
): Promise<void> {
  const roomId = socket.data.roomId;
  if (!roomId) return;

  await store.updateMember(roomId, socket.data.userId, { side: null, isReady: false });
  await broadcastSides(roomId, io);
}

export async function setReady(
  socket: Socket & { data: SocketData },
  io: Server
): Promise<boolean> {
  const roomId = socket.data.roomId;
  if (!roomId) return false;

  const member = await store.getMember(roomId, socket.data.userId);
  if (!member || !member.side) {
    emitError(socket, "NO_SIDE", "Pick a side before readying up");
    return false;
  }

  await store.updateMember(roomId, socket.data.userId, { isReady: true });
  io.to(roomId).emit("side:ready_updated", { userId: socket.data.userId, isReady: true });

  // Check if both debaters are ready
  const members = await store.getMembers(roomId);
  const sideA = members.find((m) => m.side === "a" && m.isReady);
  const sideB = members.find((m) => m.side === "b" && m.isReady);

  return !!(sideA && sideB);
}

export async function clearAllSides(roomId: string, io: Server): Promise<void> {
  const members = await store.getMembers(roomId);
  for (const m of members) {
    await store.updateMember(roomId, m.userId, { side: null, isReady: false });
  }
  await broadcastSides(roomId, io);
}

async function broadcastSides(roomId: string, io: Server): Promise<void> {
  const members = await store.getMembers(roomId);

  const toUserBrief = (m: RoomMember): UserBrief => ({
    userId: m.userId,
    username: m.username,
    avatarUrl: m.avatarUrl,
  });

  const sideA = members.find((m) => m.side === "a");
  const sideB = members.find((m) => m.side === "b");
  const spectators = members
    .filter((m) => m.side === null)
    .map(toUserBrief);

  io.to(roomId).emit("side:updated", {
    sides: {
      a: sideA ? toUserBrief(sideA) : null,
      b: sideB ? toUserBrief(sideB) : null,
    },
    spectators,
  });
}
