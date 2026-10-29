import { usesGoProfiles } from "@/lib/profile-mode";
import { accountProxy } from "@/lib/server/account-proxy";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

async function readLiveCount(): Promise<number | null> {
  // Redis supplies only the live count. Its outage must not hide durable stats.
  let debatingNow: number | null = null;
  try {
    if (process.env.NEXT_PUBLIC_ROOM_BACKEND === "go") {
      const response = await fetch(new URL("/api/rooms/stats", process.env.GO_API_URL || process.env.NEXT_PUBLIC_GO_HTTP_URL || "http://127.0.0.1:3002"), { cache: "no-store", signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw new Error("Live statistics unavailable");
      const stats = await response.json();
      if (!Number.isSafeInteger(stats.debatingNow) || stats.debatingNow < 0) throw new Error("Invalid live statistics");
      debatingNow = stats.debatingNow;
    } else {
    const { redis } = await import("@/lib/redis");
    const activeRoomIds = await redis.smembers<string[]>("sp:rooms:active");
    const memberCounts = activeRoomIds.length > 0
      ? await Promise.all(activeRoomIds.map((id) => redis.hlen(`sp:room:${id}:members`)))
      : [];
    debatingNow = memberCounts.reduce((sum, n) => sum + n, 0);
    }
  } catch {
    console.warn("Live room statistics unavailable");
  }
  return debatingNow;
}

async function readStats() {
  if (usesGoProfiles()) {
    // Independent read paths share no transaction or cache dependency.
    const [response, debatingNow] = await Promise.all([
      accountProxy("/api/statistics", undefined, false),
      readLiveCount(),
    ]);
    if (!response.ok) return response;
    return NextResponse.json({ ...await response.json(), debatingNow }, { headers: { "Cache-Control": "no-store" } });
  }

  const supabase = await createClient();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const debatingNow = await readLiveCount();
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

  if ((mostWinsResult.error && mostWinsResult.error.code !== "PGRST116") ||
      debatesTodayResult.error || debatesYesterdayResult.error || votesResult.error) {
    throw new Error("Statistics query failed");
  }
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

  return NextResponse.json({ mostWins, debatesToday, debatesPctChange, votesCastAllTime, debatingNow }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  try {
    return await readStats();
  } catch {
    console.warn("Landing statistics unavailable");
    return NextResponse.json({ error: "Statistics temporarily unavailable" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}