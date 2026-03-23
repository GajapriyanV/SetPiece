import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { redis } from "@/lib/redis";

export async function GET() {
  const supabase = await createClient();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const activeRoomIds = (await redis.smembers("sp:rooms:active")) as string[];
  const memberCounts = activeRoomIds.length > 0
    ? await Promise.all(activeRoomIds.map((id) => redis.hlen(`sp:room:${id}:members`)))
    : [];
  const debatingNow = memberCounts.reduce((sum, n) => sum + n, 0);

  const [mostWinsResult, debatesTodayResult, debatesYesterdayResult, votesResult] = await Promise.all([
    // User with most wins
    supabase
      .from("profiles")
      .select("username, wins")
      .order("wins", { ascending: false })
      .limit(1)
      .single(),

    // Debates that started today
    supabase
      .from("debates")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayStart.toISOString()),

    // Debates that started yesterday
    supabase
      .from("debates")
      .select("id", { count: "exact", head: true })
      .gte("created_at", yesterdayStart.toISOString())
      .lt("created_at", todayStart.toISOString()),

    // All votes cast across finished debates
    supabase
      .from("debates")
      .select("votes_a, votes_b")
      .eq("status", "finished"),
  ]);

  const mostWins = mostWinsResult.data
    ? { username: mostWinsResult.data.username, wins: mostWinsResult.data.wins ?? 0 }
    : null;

  const debatesToday = debatesTodayResult.count ?? 0;
  const debatesYesterday = debatesYesterdayResult.count ?? 0;
  const debatesPctChange = debatesYesterday === 0
    ? null
    : Math.round(((debatesToday - debatesYesterday) / debatesYesterday) * 100);

  const votesCastAllTime = (votesResult.data ?? []).reduce(
    (sum, d) => sum + (d.votes_a ?? 0) + (d.votes_b ?? 0),
    0
  );

  return NextResponse.json({ mostWins, debatesToday, debatesPctChange, votesCastAllTime, debatingNow });
}
