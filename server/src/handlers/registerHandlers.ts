import type { Server, Socket } from "socket.io";
import type { SocketData } from "../types/events.js";
import * as roomManager from "../rooms/roomManager.js";
import * as sidePicker from "../rooms/sidePicker.js";
import { clearAllSides } from "../rooms/sidePicker.js";
import { beginDebateCountdown, startSidePickTimer, clearSidePickTimer } from "../debate/debateHandler.js";
import { handleChatSend } from "../chat/chatHandler.js";
import { handleVoteCast } from "../voting/voteHandler.js";
import { clearRoomTimer } from "../debate/timerService.js";
import { closeLiveKitRoom } from "../livekit/livekitService.js";
import * as featuredRoom from "../rooms/featuredRoomManager.js";
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

  socket.on("room:create_featured", async ({ topics }) => {
    try {
      const roomId = await featuredRoom.createFeaturedRoom(topics);
      socket.emit("room:created", { roomId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create featured room";
      emitError(socket, "CREATE_FAILED", msg);
    }
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

    // Check if this is a reconnection within grace period
    const gracePeriodKey = `${roomId}:${socket.data.userId}`;
    const graceTimer = disconnectTimers.get(gracePeriodKey);
    const isReconnect = !!graceTimer;

    if (graceTimer) {
      clearTimeout(graceTimer);
      disconnectTimers.delete(gracePeriodKey);
      logger.info({ userId: socket.data.userId, roomId }, "Reconnected within grace period");
    }

    // If reconnecting and still a member (e.g. debater during live), restore socket without re-adding
    const existingMember = isReconnect ? await store.getMember(roomId, socket.data.userId) : null;
    if (isReconnect && existingMember) {
      // Restore socket to the room without creating a fresh member
      roomManager.clearEmptyRoomTimer(roomId);
      socket.data.roomId = roomId;
      socket.join(roomId);

      const fullState = await roomManager.getFullRoomState(roomId);
      if (!fullState) {
        return emitError(socket, "JOIN_FAILED", "Room not found");
      }
      socket.emit("room:joined", { roomId, state: fullState });

      // Notify everyone that this user reconnected
      io.to(roomId).emit("debate:debater_reconnected", {
        userId: socket.data.userId,
        username: socket.data.username,
      });
      logger.info({ userId: socket.data.userId, roomId }, "Debater reconnected, debate resumes");
    } else {
      const state = await roomManager.joinRoom(roomId, socket, io);
      if (!state) {
        return emitError(socket, "JOIN_FAILED", "Room not found or full");
      }
      socket.emit("room:joined", { roomId, state });
    }

    // Featured room: reset inactivity timer + start topic cycle when 2+ join
    const roomAfterJoin = await store.getRoom(roomId);
    if (roomAfterJoin?.isFeatured) {
      featuredRoom.resetInactivityTimer(roomId, io);

      const memberCount = await store.getMemberCount(roomId);
      if (
        memberCount >= 2 &&
        roomAfterJoin.status === "lobby" &&
        !roomAfterJoin.debaterAId &&
        !roomAfterJoin.debaterBId &&
        !featuredRoom.hasSidePickTimer(roomId)
      ) {
        // 2 people are in, no timer running — kick off the side-pick cycle
        await featuredRoom.startFirstTopicReveal(roomId, io);
      }
    }
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
      const room = await store.getRoom(socket.data.roomId);
      if (room?.isFeatured) {
        featuredRoom.clearFeaturedSidePickTimer(socket.data.roomId);
        featuredRoom.resetInactivityTimer(socket.data.roomId, io);
      } else {
        clearSidePickTimer(socket.data.roomId);
      }
      await beginDebateCountdown(socket.data.roomId, io);
    }
  });

  // ── Featured skip vote ──

  socket.on("featured:vote_skip", async () => {
    const roomId = socket.data.roomId;
    if (!roomId) return emitError(socket, "NOT_IN_ROOM", "You are not in a room");
    await featuredRoom.voteSkipTopic(roomId, socket.data.userId, io);
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
    const isLobby = room.status === "lobby" || room.status === "side_pick";

    // Check if they had a side picked (for featured lobby tracking)
    const member = await store.getMember(roomId, socket.data.userId);
    const hadSide = member?.side != null;

    // Grace periods:
    // - Debater during live: 15s (allow reconnect on refresh)
    // - Side-picker in lobby: 15s
    // - Everyone else: 30s
    const gracePeriodMs = isDebater && isLive
      ? 15_000
      : hadSide && isLobby
        ? 15_000
        : 30_000;
    const gracePeriodKey = `${roomId}:${socket.data.userId}`;

    logger.info(
      { userId: socket.data.userId, roomId, isDebater, hadSide, gracePeriodMs },
      "User disconnected, starting grace period"
    );

    // Immediately notify others that a debater disconnected during live
    if (isDebater && isLive) {
      const disconnectEvent = room.isFeatured
        ? "featured:debater_disconnected" as const
        : "debate:debater_disconnected" as const;
      io.to(roomId).emit(disconnectEvent, {
        userId: socket.data.userId,
        username: socket.data.username,
      });
    }

    const timer = setTimeout(async () => {
      disconnectTimers.delete(gracePeriodKey);

      // Grace period expired
      if (isDebater && isLive) {
        // Cancel the debate
        clearRoomTimer(roomId);
        await closeLiveKitRoom(roomId);

        // Update debate to cancelled in Supabase
        if (room.debateId) {
          const { supabase } = await import("../lib/supabase.js");
          await supabase
            .from("debates")
            .update({ status: "cancelled", finished_at: new Date().toISOString() })
            .eq("id", room.debateId);
        }

        // Remove disconnected member
        await store.removeMember(roomId, socket.data.userId);
        io.to(roomId).emit("room:member_left", { userId: socket.data.userId });

        if (room.isFeatured) {
          // Featured: keep room alive, re-reveal same topic
          io.to(roomId).emit("featured:debate_cancelled", {
            reason: "disconnected",
            username: socket.data.username,
          });
          await featuredRoom.handleDebateCancelled(roomId, io);
          logger.info({ roomId }, "Featured debate cancelled due to debater disconnect");
        } else {
          // Normal room: keep room alive, reset to lobby
          const remainingCount = await store.getMemberCount(roomId);
          if (remainingCount === 0) {
            // No one left — start cleanup timer
            roomManager.startEmptyRoomTimer(roomId);
          } else {
            io.to(roomId).emit("debate:cancelled", {
              reason: "disconnected",
              username: socket.data.username,
            });
            await store.updateRoom(roomId, {
              status: "lobby",
              debaterAId: null,
              debaterBId: null,
              debateId: null,
            });
            await clearAllSides(roomId, io);
            await store.clearPhase(roomId);
            // Tell frontend to reset to lobby view
            io.to(roomId).emit("topic:change", {
              topic: room.topic,
              sideALabel: room.sideALabel,
              sideBLabel: room.sideBLabel,
            });
            logger.info({ roomId }, "Debate cancelled, room reset to lobby");
          }
        }
      } else {
        // Remove member
        await store.removeMember(roomId, socket.data.userId);
        io.to(roomId).emit("room:member_left", { userId: socket.data.userId });

        // If a side-picker disconnected during lobby, broadcast updated sides
        if (hadSide && isLobby) {
          await sidePicker.broadcastSides(roomId, io);
          logger.info({ roomId, userId: socket.data.userId }, "Side-picker disconnected, sides updated");
        }

        // If room is now empty, start cleanup timer (featured rooms use their own inactivity timer)
        if (!room.isFeatured) {
          const count = await store.getMemberCount(roomId);
          if (count === 0) {
            clearRoomTimer(roomId);
            roomManager.startEmptyRoomTimer(roomId);
          }
        }
      }
    }, gracePeriodMs);

    disconnectTimers.set(gracePeriodKey, timer);
  });
}

async function handleLeave(socket: Socket & { data: SocketData }, io: Server): Promise<void> {
  const roomId = socket.data.roomId;
  if (!roomId) return;

  const room = await store.getRoom(roomId);
  if (!room) {
    await roomManager.leaveRoom(socket, io);
    return;
  }

  const isDebater =
    socket.data.userId === room.debaterAId || socket.data.userId === room.debaterBId;
  const isLive = room.status === "live" || room.status === "voting";

  // ── Debater leaving during live/voting — cancel the debate ──
  if (isDebater && isLive) {
    clearRoomTimer(roomId);
    await closeLiveKitRoom(roomId);
    if (room.debateId) {
      const { supabase } = await import("../lib/supabase.js");
      await supabase
        .from("debates")
        .update({ status: "cancelled", finished_at: new Date().toISOString() })
        .eq("id", room.debateId);
    }

    if (room.isFeatured) {
      io.to(roomId).emit("featured:debate_cancelled", {
        reason: "left the room",
        username: socket.data.username,
      });
      await roomManager.leaveRoom(socket, io);
      await featuredRoom.handleDebateCancelled(roomId, io);
      return;
    }

    // Normal room: keep room alive, reset to lobby
    io.to(roomId).emit("debate:cancelled", {
      reason: "left the room",
      username: socket.data.username,
    });

    // Remove the leaving user
    await store.removeMember(roomId, socket.data.userId);
    socket.leave(roomId);
    socket.data.roomId = null;
    io.to(roomId).emit("room:member_left", { userId: socket.data.userId });

    const remainingCount = await store.getMemberCount(roomId);
    if (remainingCount === 0) {
      roomManager.startEmptyRoomTimer(roomId);
    } else {
      await store.updateRoom(roomId, {
        status: "lobby",
        debaterAId: null,
        debaterBId: null,
        debateId: null,
      });
      await clearAllSides(roomId, io);
      await store.clearPhase(roomId);
      // Tell frontend to reset to lobby view
      io.to(roomId).emit("topic:change", {
        topic: room.topic,
        sideALabel: room.sideALabel,
        sideBLabel: room.sideBLabel,
      });
      logger.info({ roomId }, "Debater left, room reset to lobby");
    }
    return;
  }

  // ── Side-picker leaving during lobby/side_pick ──
  if (room.status === "lobby" || room.status === "side_pick") {
    const member = await store.getMember(roomId, socket.data.userId);
    const hadSide = member?.side != null;

    await roomManager.leaveRoom(socket, io);

    if (hadSide) {
      // Broadcast updated sides so UI knows the side is free
      await sidePicker.broadcastSides(roomId, io);
      logger.info({ roomId, userId: socket.data.userId, side: member!.side }, "Side-picker left, sides updated");
    }
    return;
  }

  await roomManager.leaveRoom(socket, io);
}

export { disconnectTimers };
