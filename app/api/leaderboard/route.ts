import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { SEASON_01_START } from "@/lib/season";

// IMPORTANT: Supabase profiles table must have a public SELECT RLS policy:
// CREATE POLICY "leaderboard_public_read" ON profiles FOR SELECT USING (true);

const PAGE_SIZE = 20;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const type = searchParams.get("type") ?? "unranked"; // unranked | ranked
  const section = searchParams.get("section") ?? "global"; // global | regional
  const period = searchParams.get("period") ?? "alltime"; // alltime | season
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();

  // For regional: require auth and get the logged-in user's country
  let userCountry: string | null = null;
  if (section === "regional") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required for regional leaderboard" },
        { status: 401 }
      );
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("country")
      .eq("id", user.id)
      .single();
    userCountry = profile?.country ?? null;
    if (!userCountry) {
      return NextResponse.json(
        { players: [], total: 0, page, userCountry: null },
        { status: 200 }
      );
    }
  }

  // ── All Time: query profiles directly ────────────────────────────────────────
  if (period === "alltime") {
    let query = supabase
      .from("profiles")
      .select("id, username, country, elo, wins, losses, draws, debates_count, avatar_url, created_at", {
        count: "exact",
      });

    if (section === "regional" && userCountry) {
      query = query.eq("country", userCountry);
    }

    if (type === "ranked") {
      query = query
        .order("elo", { ascending: false })
        .order("debates_count", { ascending: false })
        .order("created_at", { ascending: true });
    } else {
      query = query
        .order("wins", { ascending: false })
        .order("losses", { ascending: true }) // fewer losses = higher win% when wins are equal
        .order("debates_count", { ascending: false })
        .order("created_at", { ascending: true });
    }

    query = query.range(offset, offset + PAGE_SIZE - 1);

    const { data, error, count } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const players = (data ?? []).map((p) => {
      const total = (p.wins ?? 0) + (p.losses ?? 0) + (p.draws ?? 0);
      const winPct = total > 0 ? Math.round(((p.wins ?? 0) / total) * 100) : 0;
      return {
        id: p.id,
        username: p.username,
        country: p.country ?? null,
        wins: p.wins ?? 0,
        losses: p.losses ?? 0,
        draws: p.draws ?? 0,
        debates_count: p.debates_count ?? 0,
        winPct,
        elo: p.elo ?? 1200,
        avatarUrl: p.avatar_url ?? null,
      };
    });

    return NextResponse.json({ players, total: count ?? 0, page, userCountry });
  }

  // ── Season: aggregate from debates table ─────────────────────────────────────
  const { data: debates, error: debateError } = await supabase
    .from("debates")
    .select("debater_a_id, debater_b_id, winner_id, result")
    .eq("status", "finished")
    .gte("finished_at", SEASON_01_START.toISOString());

  if (debateError) {
    return NextResponse.json({ error: debateError.message }, { status: 500 });
  }

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

  // Fetch ALL profiles so non-debaters still appear (with 0 season wins)
  let profileQuery = supabase
    .from("profiles")
    .select("id, username, country, elo, avatar_url, created_at");

  if (section === "regional" && userCountry) {
    profileQuery = profileQuery.eq("country", userCountry);
  }

  const { data: allProfiles } = await profileQuery;

  const merged = (allProfiles ?? []).map((p) => {
    const s = stats[p.id] ?? { wins: 0, losses: 0, draws: 0 };
    const debateTotal = s.wins + s.losses + s.draws;
    const winPct = debateTotal > 0 ? Math.round((s.wins / debateTotal) * 100) : 0;
    return {
      id: p.id,
      username: p.username,
      country: p.country ?? null,
      wins: s.wins,
      losses: s.losses,
      draws: s.draws,
      winPct,
      elo: p.elo ?? 1200,
      debates_count: debateTotal,
      avatarUrl: p.avatar_url ?? null,
      createdAt: p.created_at as string | null,
    };
  });

  if (type === "ranked") {
    merged.sort((a, b) => {
      if (b.elo !== a.elo) return b.elo - a.elo;
      if (b.debates_count !== a.debates_count) return b.debates_count - a.debates_count;
      return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
    });
  } else {
    merged.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.winPct !== a.winPct) return b.winPct - a.winPct;
      if (b.debates_count !== a.debates_count) return b.debates_count - a.debates_count;
      return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
    });
  }

  const total = merged.length;
  const paged = merged.slice(offset, offset + PAGE_SIZE);

  return NextResponse.json({ players: paged, total, page, userCountry });
}
