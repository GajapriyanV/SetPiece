import type { Server } from "socket.io";
import * as store from "../state/roomStore.js";
import * as voteStore from "../state/voteStore.js";
import {
  DEBATE_PHASES,
  VOTING_DURATION_MS,
  RESULTS_DISPLAY_MS,
  getPhaseByIndex,
  isLastPhase,
} from "./phaseEngine.js";
import { tallyAndPersist } from "../voting/voteTally.js";
import { setCanPublish, closeLiveKitRoom } from "../livekit/livekitService.js";
import { handleDebateComplete } from "../rooms/featuredRoomManager.js";
import { clearAllSides } from "../rooms/sidePicker.js";
import { startEmptyRoomTimer } from "../rooms/roomManager.js";
import { logger } from "../utils/logger.js";

// Active timers per room
const timers = new Map<string, NodeJS.Timeout>();

export function clearRoomTimer(roomId: string): void {
  const existing = timers.get(roomId);
  if (existing) {
    clearTimeout(existing);
    timers.delete(roomId);
  }
}

export function setRoomTimer(roomId: string, timer: NodeJS.Timeout): void {
  timers.set(roomId, timer);
}

export async function startDebate(roomId: string, debateId: string, io: Server): Promise<void> {
  // Begin first phase
  await startPhase(roomId, 0, io);
}

async function startPhase(roomId: string, index: number, io: Server): Promise<void> {
  const phase = getPhaseByIndex(index);
  if (!phase) return;

  const endsAt = Date.now() + phase.durationMs;

  await store.setPhase(roomId, {
    name: phase.name,
    speaker: phase.speaker,
    endsAt,
    index,
  });

  await store.updateRoom(roomId, { status: "live" });

  io.to(roomId).emit("debate:phase_change", {
    phase: phase.name,
    speaker: phase.speaker,
    endsAt,
    index,
  });

  logger.info({ roomId, phase: phase.name, endsAt }, "Phase started");

  // Flip LiveKit mic permissions — only the active speaker can publish
  const room = await store.getRoom(roomId);
  if (room?.debaterAId && room?.debaterBId) {
    const aCanPublish = phase.speaker === "a";
    await Promise.allSettled([
      setCanPublish(roomId, room.debaterAId, aCanPublish),
      setCanPublish(roomId, room.debaterBId, !aCanPublish),
    ]);
  }

  // Schedule next phase or voting
  clearRoomTimer(roomId);
  const timer = setTimeout(async () => {
    timers.delete(roomId);

    if (isLastPhase(index)) {
      // Debate ended, start voting
      await startVoting(roomId, io);
    } else {
      await startPhase(roomId, index + 1, io);
    }
  }, phase.durationMs);

  timers.set(roomId, timer);
}

async function startVoting(roomId: string, io: Server): Promise<void> {
  const endsAt = Date.now() + VOTING_DURATION_MS;

  await store.updateRoom(roomId, { status: "voting" });
  await store.clearPhase(roomId);

  // Mute both debaters — debate is over
  const room = await store.getRoom(roomId);
  if (room?.debaterAId && room?.debaterBId) {
    await Promise.allSettled([
      setCanPublish(roomId, room.debaterAId, false),
      setCanPublish(roomId, room.debaterBId, false),
    ]);
  }

  io.to(roomId).emit("debate:ended");
  io.to(roomId).emit("vote:window_open", { endsAt });

  logger.info({ roomId }, "Voting started");

  // Broadcast vote counts every 5 seconds
  const countInterval = setInterval(async () => {
    const counts = await voteStore.getVoteCounts(roomId);
    io.to(roomId).emit("vote:count_update", {
      a: counts.a,
      b: counts.b,
      total: counts.a + counts.b,
    });
  }, 5000);

  clearRoomTimer(roomId);
  const timer = setTimeout(async () => {
    clearInterval(countInterval);
    timers.delete(roomId);

    io.to(roomId).emit("vote:window_closed");
    await finishDebate(roomId, io);
  }, VOTING_DURATION_MS);

  timers.set(roomId, timer);
}

async function finishDebate(roomId: string, io: Server): Promise<void> {
  await store.updateRoom(roomId, { status: "results" });

  const room = await store.getRoom(roomId);
  if (!room || !room.debateId) return;

  try {
    const result = await tallyAndPersist(roomId, room.debateId, io);
    io.to(roomId).emit("results:final", result);
    logger.info({ roomId, result: result.result }, "Debate finished");
  } catch (err) {
    logger.error({ roomId, err }, "Failed to tally and persist results");
  }

  // After results display: close regular rooms, cycle featured rooms
  clearRoomTimer(roomId);
  const timer = setTimeout(async () => {
    timers.delete(roomId);

    if (room.isFeatured) {
      await handleDebateComplete(roomId, io);
    } else {
      await closeLiveKitRoom(roomId);

      // Normal room: reset to lobby instead of closing
      const members = await store.getMembers(roomId);
      if (members.length === 0) {
        startEmptyRoomTimer(roomId);
      } else {
        await store.updateRoom(roomId, {
          status: "lobby",
          debaterAId: null,
          debaterBId: null,
          debateId: null,
        });
        await clearAllSides(roomId, io);
        await store.clearPhase(roomId);
        io.to(roomId).emit("topic:change", {
          topic: room.topic,
          sideALabel: room.sideALabel,
          sideBLabel: room.sideBLabel,
        });
        logger.info({ roomId }, "Debate complete, room reset to lobby");
      }
    }
  }, RESULTS_DISPLAY_MS);

  timers.set(roomId, timer);
}

export { timers };
