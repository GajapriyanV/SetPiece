import type { Server } from "socket.io";
import * as store from "../state/roomStore.js";
import { supabase } from "../lib/supabase.js";
import { startDebate, clearRoomTimer } from "./timerService.js";
import { STARTING_COUNTDOWN_MS, SIDE_PICK_TIMEOUT_MS } from "./phaseEngine.js";
import { clearAllSides } from "../rooms/sidePicker.js";
import { TOPICS } from "./topics.js";
import { logger } from "../utils/logger.js";

// Track side-pick timers separately
const sidePickTimers = new Map<string, NodeJS.Timeout>();

export function clearSidePickTimer(roomId: string): void {
  const existing = sidePickTimers.get(roomId);
  if (existing) {
    clearTimeout(existing);
    sidePickTimers.delete(roomId);
  }
}

export function startSidePickTimer(roomId: string, io: Server): void {
  clearSidePickTimer(roomId);

  const timer = setTimeout(async () => {
    sidePickTimers.delete(roomId);

    // Check if we have two debaters on opposite sides
    const members = await store.getMembers(roomId);
    const sideA = members.find((m) => m.side === "a" && m.isReady);
    const sideB = members.find((m) => m.side === "b" && m.isReady);

    if (sideA && sideB) {
      // Both ready — this timer shouldn't fire, but just in case
      return;
    }

    // Timeout or deadlock — reset with new topic
    logger.info({ roomId }, "Side-pick timeout, rotating topic");
    await clearAllSides(roomId, io);

    const newTopic = pickRandomTopic();
    await store.updateRoom(roomId, {
      status: "lobby",
      topic: newTopic.topic,
      sideALabel: newTopic.sideALabel,
      sideBLabel: newTopic.sideBLabel,
    });

    io.to(roomId).emit("topic:change", {
      topic: newTopic.topic,
      sideALabel: newTopic.sideALabel,
      sideBLabel: newTopic.sideBLabel,
    });
  }, SIDE_PICK_TIMEOUT_MS);

  sidePickTimers.set(roomId, timer);
}

export async function beginDebateCountdown(roomId: string, io: Server): Promise<void> {
  clearSidePickTimer(roomId);

  const room = await store.getRoom(roomId);
  if (!room) return;

  const members = await store.getMembers(roomId);
  const debaterA = members.find((m) => m.side === "a");
  const debaterB = members.find((m) => m.side === "b");
  if (!debaterA || !debaterB) return;

  // Insert debate row in Supabase
  const { data, error } = await supabase
    .from("debates")
    .insert({
      room_code: roomId,
      topic: room.topic,
      side_a_label: room.sideALabel,
      side_b_label: room.sideBLabel,
      debater_a_id: debaterA.userId,
      debater_b_id: debaterB.userId,
      status: "live",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    logger.error({ error }, "Failed to create debate record");
    return;
  }

  const debateId = data.id;

  await store.updateRoom(roomId, {
    debaterAId: debaterA.userId,
    debaterBId: debaterB.userId,
    debateId,
    status: "live",
  });

  // Emit 5s countdown
  io.to(roomId).emit("debate:starting", { debateId, countdown: 5 });

  // After countdown, start actual debate
  clearRoomTimer(roomId);
  setTimeout(async () => {
    await startDebate(roomId, debateId, io);
  }, STARTING_COUNTDOWN_MS);
}

function pickRandomTopic() {
  const idx = Math.floor(Math.random() * TOPICS.length);
  return TOPICS[idx];
}
