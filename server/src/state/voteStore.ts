import { redis } from "../lib/redis.js";
import type { Side } from "../types/room.js";

function voteKey(roomId: string) {
  return `sp:room:${roomId}:votes`;
}

function countKey(roomId: string) {
  return `sp:room:${roomId}:vote_counts`;
}

export async function castVote(roomId: string, userId: string, side: Side): Promise<void> {
  // Get previous vote to adjust counts
  const prev = await redis.hget<string>(voteKey(roomId), userId);

  // Set the vote
  await redis.hset(voteKey(roomId), { [userId]: side });
  await redis.expire(voteKey(roomId), 1800);

  // Update counts
  if (prev && prev !== side) {
    // Changed vote — decrement old, increment new
    await redis.hincrby(countKey(roomId), prev, -1);
    await redis.hincrby(countKey(roomId), side, 1);
  } else if (!prev) {
    // New vote
    await redis.hincrby(countKey(roomId), side, 1);
  }
  await redis.expire(countKey(roomId), 1800);
}

export async function getVoteCounts(roomId: string): Promise<{ a: number; b: number }> {
  const data = await redis.hgetall<Record<string, string>>(countKey(roomId));
  return {
    a: parseInt(data?.a || "0", 10),
    b: parseInt(data?.b || "0", 10),
  };
}

export async function getAllVotes(roomId: string): Promise<Record<string, Side>> {
  const data = await redis.hgetall<Record<string, string>>(voteKey(roomId));
  if (!data) return {};
  return data as Record<string, Side>;
}

export async function clearVotes(roomId: string): Promise<void> {
  await redis.del(voteKey(roomId));
  await redis.del(countKey(roomId));
}
