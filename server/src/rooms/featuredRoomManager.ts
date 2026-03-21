import type { Server } from "socket.io";
import * as store from "../state/roomStore.js";
import { generateRoomId } from "./roomManager.js";
import { clearAllSides } from "./sidePicker.js";
import { clearRoomTimer } from "../debate/timerService.js";
import { closeLiveKitRoom } from "../livekit/livekitService.js";
import {
  FEATURED_SIDE_PICK_TIMEOUT_MS,
  FEATURED_INACTIVITY_TIMEOUT_MS,
  CLOSING_WARNING_MS,
} from "../debate/phaseEngine.js";
import { logger } from "../utils/logger.js";

// ── Timers ──

const sidePickTimers = new Map<string, NodeJS.Timeout>();
const inactivityTimers = new Map<string, NodeJS.Timeout>();
const closingTimers = new Map<string, NodeJS.Timeout>();

// ── Helpers ──

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clearAllFeaturedTimers(roomId: string): void {
  const sp = sidePickTimers.get(roomId);
  if (sp) { clearTimeout(sp); sidePickTimers.delete(roomId); }
  const it = inactivityTimers.get(roomId);
  if (it) { clearTimeout(it); inactivityTimers.delete(roomId); }
  const ct = closingTimers.get(roomId);
  if (ct) { clearTimeout(ct); closingTimers.delete(roomId); }
}

// ── Create ──

export async function createFeaturedRoom(
  topics: { topic: string; sideALabel: string; sideBLabel: string }[]
): Promise<string> {
  if (topics.length < 1 || topics.length > 15) {
    throw new Error("Featured room requires 1-15 topics");
  }

  const shuffled = shuffleArray(topics);
  const first = shuffled[0];
  const roomId = generateRoomId();

  await store.createRoom(roomId, {
    status: "lobby",
    topic: first.topic,
    sideALabel: first.sideALabel,
    sideBLabel: first.sideBLabel,
    debaterAId: null,
    debaterBId: null,
    debateId: null,
    createdAt: Date.now(),
    isFeatured: true,
  });

  await store.setFeaturedMeta(roomId, {
    topicQueue: shuffled,
    currentTopicIndex: 0,
    debatesCompleted: 0,
    maxDebates: 5,
    lastActivityAt: Date.now(),
    closingAt: null,
  });

  logger.info({ roomId, topicCount: shuffled.length }, "Featured room created");
  return roomId;
}

// ── Topic Reveal ──

export async function revealNextTopic(roomId: string, io: Server, advanceIndex = true): Promise<void> {
  const meta = await store.getFeaturedMeta(roomId);
  if (!meta) return;

  const index = advanceIndex
    ? (meta.currentTopicIndex + 1) % meta.topicQueue.length
    : meta.currentTopicIndex;

  const topic = meta.topicQueue[index];

  // Update room state
  await store.updateRoom(roomId, {
    topic: topic.topic,
    sideALabel: topic.sideALabel,
    sideBLabel: topic.sideBLabel,
    debaterAId: null,
    debaterBId: null,
    debateId: null,
    status: "lobby",
  });

  // Clear sides and skip votes
  await clearAllSides(roomId, io);
  await store.clearPhase(roomId);
  await store.clearSkipVotes(roomId);

  // Update meta
  await store.updateFeaturedMeta(roomId, {
    currentTopicIndex: index,
    lastActivityAt: Date.now(),
  });

  const memberCount = await store.getMemberCount(roomId);
  const hasEnoughPlayers = memberCount >= 2;

  // Only include sidePickEndsAt if we're actually starting the timer
  const sidePickEndsAt = hasEnoughPlayers ? Date.now() + FEATURED_SIDE_PICK_TIMEOUT_MS : null;

  io.to(roomId).emit("featured:topic_reveal", {
    topic: topic.topic,
    sideALabel: topic.sideALabel,
    sideBLabel: topic.sideBLabel,
    topicIndex: index,
    debatesCompleted: meta.debatesCompleted,
    sidePickEndsAt: sidePickEndsAt ?? 0,
  });

  logger.info({ roomId, topicIndex: index, topic: topic.topic, memberCount }, "Featured topic revealed");

  // Only start the side-pick timer if 2+ people are in the room.
  // If not, the timer will start when someone joins (handled in registerHandlers).
  if (hasEnoughPlayers) {
    startSidePickTimer(roomId, io);
  } else {
    clearFeaturedSidePickTimer(roomId);
    logger.info({ roomId, memberCount }, "Not enough players for side-pick timer, waiting for joins");
  }

  // Reset inactivity timer
  resetInactivityTimer(roomId, io);
}

// ── Skip Vote ──

const SKIP_VOTES_REQUIRED = 2;

export async function voteSkipTopic(
  roomId: string,
  userId: string,
  io: Server
): Promise<void> {
  const room = await store.getRoom(roomId);
  if (!room || !room.isFeatured || room.status !== "lobby") return;

  const count = await store.addSkipVote(roomId, userId);
  const memberCount = await store.getMemberCount(roomId);

  io.to(roomId).emit("featured:skip_votes", {
    count,
    required: SKIP_VOTES_REQUIRED,
    votedUserIds: await store.getSkipVotes(roomId),
  });

  logger.info({ roomId, userId, skipVotes: count, required: SKIP_VOTES_REQUIRED }, "Skip vote cast");

  if (count >= SKIP_VOTES_REQUIRED) {
    clearFeaturedSidePickTimer(roomId);

    io.to(roomId).emit("featured:topic_skipped", {
      reason: "Majority voted to skip",
    });

    await revealNextTopic(roomId, io, true);
  }
}

// ── Side-Pick Timer ──

export function clearFeaturedSidePickTimer(roomId: string): void {
  const existing = sidePickTimers.get(roomId);
  if (existing) {
    clearTimeout(existing);
    sidePickTimers.delete(roomId);
  }
}

function startSidePickTimer(roomId: string, io: Server): void {
  clearFeaturedSidePickTimer(roomId);

  const timer = setTimeout(async () => {
    sidePickTimers.delete(roomId);

    // Check if two opposing ready debaters exist
    const members = await store.getMembers(roomId);
    const sideA = members.find((m) => m.side === "a" && m.isReady);
    const sideB = members.find((m) => m.side === "b" && m.isReady);

    if (sideA && sideB) return; // Both ready — debate should have started

    io.to(roomId).emit("featured:topic_skipped", {
      reason: "No opposing debaters — skipping to next topic",
    });

    logger.info({ roomId }, "Featured side-pick timeout, skipping topic");

    // Advance to next topic (skip does NOT count toward debatesCompleted)
    await revealNextTopic(roomId, io, true);
  }, FEATURED_SIDE_PICK_TIMEOUT_MS);

  sidePickTimers.set(roomId, timer);
}

// ── Post-Debate Handlers ──

export async function handleDebateComplete(roomId: string, io: Server): Promise<void> {
  const meta = await store.getFeaturedMeta(roomId);
  if (!meta) return;

  const newCount = meta.debatesCompleted + 1;
  await store.updateFeaturedMeta(roomId, { debatesCompleted: newCount });

  io.to(roomId).emit("featured:debate_complete", {
    debatesCompleted: newCount,
    maxDebates: meta.maxDebates,
  });

  logger.info({ roomId, debatesCompleted: newCount, maxDebates: meta.maxDebates }, "Featured debate complete");

  if (newCount >= meta.maxDebates) {
    await startClosingSequence(roomId, io, "All 5 debates completed");
  } else {
    await revealNextTopic(roomId, io, true);
  }
}

export async function handleDebateCancelled(roomId: string, io: Server): Promise<void> {
  logger.info({ roomId }, "Featured debate cancelled, re-revealing same topic");
  // Re-reveal same topic without advancing index
  await revealNextTopic(roomId, io, false);
}

// ── Inactivity Timer ──

export function resetInactivityTimer(roomId: string, io: Server): void {
  const existing = inactivityTimers.get(roomId);
  if (existing) {
    clearTimeout(existing);
    inactivityTimers.delete(roomId);
  }

  const timer = setTimeout(async () => {
    inactivityTimers.delete(roomId);

    const count = await store.getMemberCount(roomId);
    if (count === 0) {
      await startClosingSequence(roomId, io, "No activity for 40 minutes");
    } else {
      // People are still in the room — reset
      resetInactivityTimer(roomId, io);
    }
  }, FEATURED_INACTIVITY_TIMEOUT_MS);

  inactivityTimers.set(roomId, timer);
}

// ── Closing Sequence ──

export async function startClosingSequence(roomId: string, io: Server, reason: string): Promise<void> {
  // Clear all other timers
  clearFeaturedSidePickTimer(roomId);
  clearRoomTimer(roomId);

  const closingAt = Date.now() + CLOSING_WARNING_MS;
  await store.updateFeaturedMeta(roomId, { closingAt });

  io.to(roomId).emit("room:closing", { reason, closingAt });

  logger.info({ roomId, reason }, "Featured room closing sequence started");

  const timer = setTimeout(async () => {
    closingTimers.delete(roomId);
    io.to(roomId).emit("room:closed", { reason });
    await store.deleteRoom(roomId);
    await closeLiveKitRoom(roomId);
    clearAllFeaturedTimers(roomId);
    logger.info({ roomId, reason }, "Featured room closed");
  }, CLOSING_WARNING_MS);

  closingTimers.set(roomId, timer);
}

// ── Exported for starting the side-pick timer when 2+ people join ──

export async function startFirstTopicReveal(roomId: string, io: Server): Promise<void> {
  // Topic is already set from room creation — just start the 30s side-pick timer
  // without clearing sides or re-revealing the topic
  const sidePickEndsAt = Date.now() + FEATURED_SIDE_PICK_TIMEOUT_MS;

  io.to(roomId).emit("featured:side_pick_started", { sidePickEndsAt });

  startSidePickTimer(roomId, io);
  resetInactivityTimer(roomId, io);

  logger.info({ roomId }, "Featured side-pick timer started (enough players joined)");
}

export function hasSidePickTimer(roomId: string): boolean {
  return sidePickTimers.has(roomId);
}

export { clearAllFeaturedTimers };
