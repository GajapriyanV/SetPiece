import { redis } from "../lib/redis.js";
import type { RoomState, RoomMember, PhaseState, ChatMessage } from "../types/room.js";

const TTL = 7200; // 2 hours

function roomKey(roomId: string, suffix: string) {
  return `sp:room:${roomId}:${suffix}`;
}

// ── Room State ──

export async function createRoom(roomId: string, state: RoomState): Promise<void> {
  await redis.hset(roomKey(roomId, "state"), state as unknown as Record<string, string>);
  await redis.expire(roomKey(roomId, "state"), TTL);
  await redis.sadd("sp:rooms:active", roomId);
}

export async function getRoom(roomId: string): Promise<RoomState | null> {
  const data = await redis.hgetall<Record<string, string>>(roomKey(roomId, "state"));
  if (!data || Object.keys(data).length === 0) return null;
  return {
    status: data.status as RoomState["status"],
    topic: data.topic,
    sideALabel: data.sideALabel,
    sideBLabel: data.sideBLabel,
    debaterAId: data.debaterAId || null,
    debaterBId: data.debaterBId || null,
    debateId: data.debateId || null,
    createdAt: parseInt(data.createdAt, 10),
  };
}

export async function updateRoom(roomId: string, fields: Partial<RoomState>): Promise<void> {
  await redis.hset(roomKey(roomId, "state"), fields as Record<string, unknown>);
}

export async function deleteRoom(roomId: string): Promise<void> {
  const keys = ["state", "members", "phase", "chat", "votes", "vote_counts"];
  await Promise.all(keys.map((k) => redis.del(roomKey(roomId, k))));
  await redis.srem("sp:rooms:active", roomId);
}

export async function getActiveRoomIds(): Promise<string[]> {
  return (await redis.smembers("sp:rooms:active")) as string[];
}

// ── Members ──

export async function addMember(roomId: string, member: RoomMember): Promise<void> {
  await redis.hset(roomKey(roomId, "members"), { [member.userId]: JSON.stringify(member) });
  await redis.expire(roomKey(roomId, "members"), TTL);
}

export async function removeMember(roomId: string, userId: string): Promise<void> {
  await redis.hdel(roomKey(roomId, "members"), userId);
}

export async function getMember(roomId: string, userId: string): Promise<RoomMember | null> {
  const raw = await redis.hget(roomKey(roomId, "members"), userId);
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw as RoomMember;
}

export async function getMembers(roomId: string): Promise<RoomMember[]> {
  const data = await redis.hgetall(roomKey(roomId, "members"));
  if (!data) return [];
  return Object.values(data).map((v) =>
    typeof v === "string" ? JSON.parse(v) : v as RoomMember
  );
}

export async function getMemberCount(roomId: string): Promise<number> {
  return await redis.hlen(roomKey(roomId, "members"));
}

export async function updateMember(roomId: string, userId: string, fields: Partial<RoomMember>): Promise<void> {
  const member = await getMember(roomId, userId);
  if (!member) return;
  const updated = { ...member, ...fields };
  await redis.hset(roomKey(roomId, "members"), { [userId]: JSON.stringify(updated) });
}

// ── Phase ──

export async function setPhase(roomId: string, phase: PhaseState): Promise<void> {
  await redis.hset(roomKey(roomId, "phase"), phase as unknown as Record<string, unknown>);
  await redis.expire(roomKey(roomId, "phase"), TTL);
}

export async function getPhase(roomId: string): Promise<PhaseState | null> {
  const data = await redis.hgetall<Record<string, string>>(roomKey(roomId, "phase"));
  if (!data || Object.keys(data).length === 0) return null;
  return {
    name: data.name as PhaseState["name"],
    speaker: (data.speaker as PhaseState["speaker"]) || null,
    endsAt: parseInt(data.endsAt, 10),
    index: parseInt(data.index, 10),
  };
}

export async function clearPhase(roomId: string): Promise<void> {
  await redis.del(roomKey(roomId, "phase"));
}

// ── Chat ──

export async function addChatMessage(roomId: string, message: ChatMessage): Promise<void> {
  await redis.lpush(roomKey(roomId, "chat"), JSON.stringify(message));
  await redis.ltrim(roomKey(roomId, "chat"), 0, 199);
  await redis.expire(roomKey(roomId, "chat"), TTL);
}

export async function getChatHistory(roomId: string, limit = 50): Promise<ChatMessage[]> {
  const raw = await redis.lrange(roomKey(roomId, "chat"), 0, limit - 1);
  return raw.map((v) => (typeof v === "string" ? JSON.parse(v) : v) as ChatMessage).reverse();
}
