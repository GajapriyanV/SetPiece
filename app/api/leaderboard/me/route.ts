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
    .select("id, username, wins, losses, draws, debates_count, elo, country")
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

    let countQuery = supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gt("wins", myWins);

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
  let allProfilesQuery = supabase.from("profiles").select("id");
  if (section === "regional" && userCountry) {
    allProfilesQuery = allProfilesQuery.eq("country", userCountry);
  }
  const { data: allProfiles } = await allProfilesQuery;
  const allIds = (allProfiles ?? []).map((p) => p.id);

  // Rank = count of users with strictly more season wins
  const rank =
    allIds.filter((id) => (stats[id]?.wins ?? 0) > mySeasonStats.wins).length + 1;

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
