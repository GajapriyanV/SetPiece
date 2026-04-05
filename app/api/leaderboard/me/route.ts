import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { SEASON_01_START } from "@/lib/season";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const section = searchParams.get("section") ?? "global"; // global | regional
  const period = searchParams.get("period") ?? "alltime";  // alltime | season

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, wins, losses, draws, debates_count, elo, country, created_at")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const userCountry = profile.country ?? null;

  // ── All Time ─────────────────────────────────────────────────────────────────
  if (period === "alltime") {
    const myWins = profile.wins ?? 0;
    const myLosses = profile.losses ?? 0;
    const myDraws = profile.draws ?? 0;
    const total = myWins + myLosses + myDraws;
    const winPct = total > 0 ? Math.round((myWins / total) * 100) : 0;

    const myDebatesCount = profile.debates_count ?? 0;
    const myCreatedAt = profile.created_at;

    let countQuery = supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .or(
        `wins.gt.${myWins},` +
        `and(wins.eq.${myWins},losses.lt.${myLosses}),` +
        `and(wins.eq.${myWins},losses.eq.${myLosses},debates_count.gt.${myDebatesCount}),` +
        `and(wins.eq.${myWins},losses.eq.${myLosses},debates_count.eq.${myDebatesCount},created_at.lt.${myCreatedAt})`
      );

    if (section === "regional" && userCountry) {
      countQuery = countQuery.eq("country", userCountry);
    }

    const { count: aboveCount } = await countQuery;
    const rank = (aboveCount ?? 0) + 1;

    return NextResponse.json({
      userId: user.id,
      rank,
      wins: myWins,
      losses: myLosses,
      draws: myDraws,
      elo: profile.elo ?? 1200,
      winPct,
      debates_count: profile.debates_count ?? 0,
    });
  }

  // ── Season ───────────────────────────────────────────────────────────────────
  const { data: debates } = await supabase
    .from("debates")
    .select("debater_a_id, debater_b_id, winner_id, result")
    .eq("status", "finished")
    .gte("finished_at", SEASON_01_START.toISOString());

  // Aggregate season stats per user
  const stats: Record<string, { wins: number; losses: number; draws: number }> = {};
  for (const d of debates ?? []) {
    const participants = [d.debater_a_id, d.debater_b_id].filter(Boolean);
    for (const uid of participants) {
      if (!stats[uid]) stats[uid] = { wins: 0, losses: 0, draws: 0 };
    }
    if (d.result === "draw") {
      if (d.debater_a_id) stats[d.debater_a_id].draws++;
      if (d.debater_b_id) stats[d.debater_b_id].draws++;
    } else if (d.winner_id) {
      stats[d.winner_id].wins++;
      const loserId =
        d.debater_a_id === d.winner_id ? d.debater_b_id : d.debater_a_id;
      if (loserId && stats[loserId]) stats[loserId].losses++;
    }
  }

  const mySeasonStats = stats[user.id] ?? { wins: 0, losses: 0, draws: 0 };
  const seasonTotal = mySeasonStats.wins + mySeasonStats.losses + mySeasonStats.draws;
  const winPct = seasonTotal > 0
    ? Math.round((mySeasonStats.wins / seasonTotal) * 100)
    : 0;

  // Rank against ALL profiles (including non-debaters), filtered by country if regional
  let allProfilesQuery = supabase.from("profiles").select("id, created_at");
  if (section === "regional" && userCountry) {
    allProfilesQuery = allProfilesQuery.eq("country", userCountry);
  }
  const { data: allProfiles } = await allProfilesQuery;

  const myW = mySeasonStats.wins;
  const myL = mySeasonStats.losses;
  const myD = mySeasonStats.wins + mySeasonStats.losses + mySeasonStats.draws;
  const myTs = profile.created_at ?? "";

  // Rank = count of users strictly ahead using same tiebreaker as leaderboard:
  // wins↓ → losses↑ → debates_count↓ → created_at↑
  const rank = (allProfiles ?? []).filter((p) => {
    const s = stats[p.id] ?? { wins: 0, losses: 0, draws: 0 };
    const theirW = s.wins;
    const theirL = s.losses;
    const theirD = s.wins + s.losses + s.draws;
    const theirTs = (p.created_at as string) ?? "";
    if (theirW !== myW) return theirW > myW;
    if (theirL !== myL) return theirL < myL;
    if (theirD !== myD) return theirD > myD;
    return theirTs < myTs;
  }).length + 1;

  return NextResponse.json({
    userId: user.id,
    rank,
    wins: mySeasonStats.wins,
    losses: mySeasonStats.losses,
    draws: mySeasonStats.draws,
    elo: profile.elo ?? 1200,
    winPct,
    debates_count: seasonTotal,
  });
}
