import type { Server, Socket } from "socket.io";
import * as store from "../state/roomStore.js";
import * as voteStore from "../state/voteStore.js";
import type { Side } from "../types/room.js";
import type { SocketData } from "../types/events.js";
import { emitError } from "../utils/errors.js";

export async function handleVoteCast(
  socket: Socket & { data: SocketData },
  io: Server,
  side: Side
): Promise<void> {
  const roomId = socket.data.roomId;
  if (!roomId) return emitError(socket, "NOT_IN_ROOM", "You are not in a room");

  const room = await store.getRoom(roomId);
  if (!room || room.status !== "voting") {
    return emitError(socket, "NOT_VOTING", "Voting is not open");
  }

  // Debaters cannot vote in their own debate
  if (socket.data.userId === room.debaterAId || socket.data.userId === room.debaterBId) {
    return emitError(socket, "DEBATER_NO_VOTE", "Debaters cannot vote in their own debate");
  }

  if (side !== "a" && side !== "b") {
    return emitError(socket, "INVALID_SIDE", "Side must be 'a' or 'b'");
  }

  await voteStore.castVote(roomId, socket.data.userId, side);

  // Broadcast updated counts
  const counts = await voteStore.getVoteCounts(roomId);
  io.to(roomId).emit("vote:count_update", {
    a: counts.a,
    b: counts.b,
    total: counts.a + counts.b,
  });
}
