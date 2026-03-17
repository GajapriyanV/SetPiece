import type { Server } from "socket.io";
import * as store from "../state/roomStore.js";
import * as voteStore from "../state/voteStore.js";
import { supabase } from "../lib/supabase.js";
import { calculateElo } from "../elo/eloCalculator.js";
import { logger } from "../utils/logger.js";

interface FinalResult {
  winnerId: string | null;
  result: "side_a" | "side_b" | "draw";
  votesA: number;
  votesB: number;
  eloChange: number;
  debaterA: { id: string; username: string; newElo: number };
  debaterB: { id: string; username: string; newElo: number };
}

export async function tallyAndPersist(
  roomId: string,
  debateId: string,
  io: Server
): Promise<FinalResult> {
  const room = await store.getRoom(roomId);
  if (!room || !room.debaterAId || !room.debaterBId) {
    throw new Error("Invalid room state for tally");
  }

  const counts = await voteStore.getVoteCounts(roomId);
  const allVotes = await voteStore.getAllVotes(roomId);

  // Determine result
  let result: "side_a" | "side_b" | "draw";
  let winnerId: string | null = null;

  if (counts.a > counts.b) {
    result = "side_a";
    winnerId = room.debaterAId;
  } else if (counts.b > counts.a) {
    result = "side_b";
    winnerId = room.debaterBId;
  } else {
    result = "draw";
  }

  // Fetch current Elo ratings
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, elo, wins, losses, draws, debates_count")
    .in("id", [room.debaterAId, room.debaterBId]);

  const profileA = profiles?.find((p) => p.id === room.debaterAId);
  const profileB = profiles?.find((p) => p.id === room.debaterBId);

  const eloA = profileA?.elo ?? 1200;
  const eloB = profileB?.elo ?? 1200;

  // Calculate new Elo
  const scoreA = result === "side_a" ? 1 : result === "draw" ? 0.5 : 0;
  const { newRatingA, newRatingB, change } = calculateElo(eloA, eloB, scoreA);

  // Update debate record
  await supabase
    .from("debates")
    .update({
      winner_id: winnerId,
      result,
      votes_a: counts.a,
      votes_b: counts.b,
      elo_change: change,
      status: "finished",
      finished_at: new Date().toISOString(),
    })
    .eq("id", debateId);

  // Update profiles
  const updateProfile = async (
    userId: string,
    newElo: number,
    won: boolean,
    drew: boolean
  ) => {
    const profile = userId === room!.debaterAId ? profileA : profileB;

    await supabase
      .from("profiles")
      .update({
        elo: newElo,
        ...(won ? { wins: (profile?.wins ?? 0) + 1 } : {}),
        ...(!won && !drew ? { losses: (profile?.losses ?? 0) + 1 } : {}),
        ...(drew ? { draws: (profile?.draws ?? 0) + 1 } : {}),
        debates_count: (profile?.debates_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
  };

  await updateProfile(room.debaterAId, newRatingA, result === "side_a", result === "draw");
  await updateProfile(room.debaterBId, newRatingB, result === "side_b", result === "draw");

  // Insert individual votes
  const voteRows = Object.entries(allVotes).map(([userId, side]) => ({
    debate_id: debateId,
    user_id: userId,
    side,
  }));

  if (voteRows.length > 0) {
    await supabase.from("votes").insert(voteRows);
  }

  // Clean up vote data from Redis
  await voteStore.clearVotes(roomId);

  logger.info({ debateId, result, votesA: counts.a, votesB: counts.b, eloChange: change }, "Debate results persisted");

  return {
    winnerId,
    result,
    votesA: counts.a,
    votesB: counts.b,
    eloChange: change,
    debaterA: {
      id: room.debaterAId,
      username: profileA?.username ?? "Unknown",
      newElo: newRatingA,
    },
    debaterB: {
      id: room.debaterBId,
      username: profileB?.username ?? "Unknown",
      newElo: newRatingB,
    },
  };
}
