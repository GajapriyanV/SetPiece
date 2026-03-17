import type { Server, Socket } from "socket.io";
import type { SocketData } from "../types/events.js";
import * as roomManager from "../rooms/roomManager.js";
import * as sidePicker from "../rooms/sidePicker.js";
import { beginDebateCountdown, startSidePickTimer, clearSidePickTimer } from "../debate/debateHandler.js";
import { handleChatSend } from "../chat/chatHandler.js";
import { handleVoteCast } from "../voting/voteHandler.js";
import { clearRoomTimer } from "../debate/timerService.js";
import { emitError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import * as store from "../state/roomStore.js";

// Track disconnect grace timers
const disconnectTimers = new Map<string, NodeJS.Timeout>();

export function registerHandlers(io: Server, socket: Socket & { data: SocketData }): void {

  // ── Room ──

  socket.on("room:create", async ({ topic, sideALabel, sideBLabel }) => {
    const roomId = await roomManager.createRoom(topic, sideALabel, sideBLabel);
    socket.emit("room:created", { roomId });
  });

  socket.on("room:join", async ({ roomId }) => {
    // If already in this room, just send state sync
    if (socket.data.roomId === roomId) {
      const state = await roomManager.getFullRoomState(roomId);
      if (state) {
        socket.join(roomId);
        socket.emit("room:joined", { roomId, state });
      } else {
        return emitError(socket, "JOIN_FAILED", "Room not found");
      }
      return;
    }
    if (socket.data.roomId) {
      // In a different room — leave it first
      await handleLeave(socket, io);
    }

    // Check if this is a reconnection
    const gracePeriodKey = `${roomId}:${socket.data.userId}`;
    const graceTimer = disconnectTimers.get(gracePeriodKey);
    if (graceTimer) {
      clearTimeout(graceTimer);
      disconnectTimers.delete(gracePeriodKey);
      logger.info({ userId: socket.data.userId, roomId }, "Reconnected within grace period");
    }

    const state = await roomManager.joinRoom(roomId, socket, io);
    if (!state) {
      return emitError(socket, "JOIN_FAILED", "Room not found or full");
    }
    socket.emit("room:joined", { roomId, state });
  });

  socket.on("room:leave", async () => {
    await handleLeave(socket, io);
  });

  socket.on("room:state", async () => {
    const roomId = socket.data.roomId;
    if (!roomId) return emitError(socket, "NOT_IN_ROOM", "You are not in a room");
    const state = await roomManager.getFullRoomState(roomId);
    if (state) {
      socket.emit("room:state_sync", { state });
    }
  });

  // ── Side picking ──

  socket.on("side:pick", async ({ side }) => {
    await sidePicker.pickSide(socket, io, side);
  });

  socket.on("side:unpick", async () => {
    await sidePicker.unpickSide(socket, io);
  });

  socket.on("side:ready", async () => {
    const bothReady = await sidePicker.setReady(socket, io);
    if (bothReady && socket.data.roomId) {
      clearSidePickTimer(socket.data.roomId);
      await beginDebateCountdown(socket.data.roomId, io);
    }
  });

  // ── Chat ──

  socket.on("chat:send", async ({ body }) => {
    await handleChatSend(socket, io, body);
  });

  // ── Voting ──

  socket.on("vote:cast", async ({ side }) => {
    await handleVoteCast(socket, io, side);
  });

  // ── Disconnect ──

  socket.on("disconnect", async () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    const room = await store.getRoom(roomId);
    if (!room) return;

    const isDebater =
      socket.data.userId === room.debaterAId || socket.data.userId === room.debaterBId;
    const isLive = room.status === "live" || room.status === "voting";

    // Grace period: 60s for debaters during live, 5min for spectators
    const gracePeriodMs = isDebater && isLive ? 60_000 : 300_000;
    const gracePeriodKey = `${roomId}:${socket.data.userId}`;

    logger.info(
      { userId: socket.data.userId, roomId, isDebater, gracePeriodMs },
      "User disconnected, starting grace period"
    );

    const timer = setTimeout(async () => {
      disconnectTimers.delete(gracePeriodKey);

      // Grace period expired
      if (isDebater && isLive) {
        // Cancel the debate
        clearRoomTimer(roomId);
        await store.updateRoom(roomId, { status: "lobby" });

        // Update debate to cancelled in Supabase
        if (room.debateId) {
          const { supabase } = await import("../lib/supabase.js");
          await supabase
            .from("debates")
            .update({ status: "cancelled", finished_at: new Date().toISOString() })
            .eq("id", room.debateId);
        }

        io.to(roomId).emit("room:closed", {
          reason: "Debater disconnected — debate cancelled",
        });
        await store.deleteRoom(roomId);
        logger.info({ roomId }, "Debate cancelled due to debater disconnect");
      } else {
        // Remove spectator
        await store.removeMember(roomId, socket.data.userId);
        io.to(roomId).emit("room:member_left", { userId: socket.data.userId });

        const count = await store.getMemberCount(roomId);
        if (count === 0) {
          clearRoomTimer(roomId);
          await store.deleteRoom(roomId);
          logger.info({ roomId }, "Room deleted (empty after grace)");
        }
      }
    }, gracePeriodMs);

    disconnectTimers.set(gracePeriodKey, timer);
  });
}

async function handleLeave(socket: Socket & { data: SocketData }, io: Server): Promise<void> {
  const roomId = socket.data.roomId;
  if (!roomId) return;

  // If they're a debater in a live debate, cancel it
  const room = await store.getRoom(roomId);
  if (room) {
    const isDebater =
      socket.data.userId === room.debaterAId || socket.data.userId === room.debaterBId;
    const isLive = room.status === "live" || room.status === "voting";

    if (isDebater && isLive) {
      clearRoomTimer(roomId);
      if (room.debateId) {
        const { supabase } = await import("../lib/supabase.js");
        await supabase
          .from("debates")
          .update({ status: "cancelled", finished_at: new Date().toISOString() })
          .eq("id", room.debateId);
      }
      io.to(roomId).emit("room:closed", { reason: "Debater left — debate cancelled" });
      await store.deleteRoom(roomId);
      socket.data.roomId = null;
      return;
    }
  }

  await roomManager.leaveRoom(socket, io);
}

export { disconnectTimers };
