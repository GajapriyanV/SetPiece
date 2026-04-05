import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { cacheUserProfile } from "@/lib/redis";

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { username, avatar_url } = await request.json();
  await cacheUserProfile(user.id, username, avatar_url ?? null);
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // ── Profile ───────────────────────────────────────────────────────────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, name, country, club, elo, wins, losses, draws, debates_count, username_changed_at, avatar_url, upvotes_received, mvp_count")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // ── Global rank (matches leaderboard tiebreaker: wins↓ losses↑ debates_count↓ created_at↑) ──
  const myWins = profile.wins ?? 0;
  const myLosses = profile.losses ?? 0;
  const myDebatesCount = profile.debates_count ?? 0;
  const myCreatedAt = user.created_at;

  const { count: aboveCount } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .or(
      `wins.gt.${myWins},` +
      `and(wins.eq.${myWins},losses.lt.${myLosses}),` +
      `and(wins.eq.${myWins},losses.eq.${myLosses},debates_count.gt.${myDebatesCount}),` +
      `and(wins.eq.${myWins},losses.eq.${myLosses},debates_count.eq.${myDebatesCount},created_at.lt.${myCreatedAt})`
    );
  const rank = (aboveCount ?? 0) + 1;

  const { count: totalDebaters } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true });

  // ── Debate history ────────────────────────────────────────────────────────────
  const { data: debates } = await supabase
    .from("debates")
    .select(
      "id, topic, side_a_label, side_b_label, debater_a_id, debater_b_id, winner_id, result, votes_a, votes_b, elo_change, finished_at"
    )
    .eq("status", "finished")
    .or(`debater_a_id.eq.${user.id},debater_b_id.eq.${user.id}`)
    .order("finished_at", { ascending: false })
    .limit(20);

  const debateHistory = (debates ?? []).map((d) => {
    const isA = d.debater_a_id === user.id;
    const isDraw = d.result === "draw";
    const isWin = !isDraw && d.winner_id === user.id;
    const result: "WIN" | "LOSS" | "DRAW" = isDraw ? "DRAW" : isWin ? "WIN" : "LOSS";
    const eloDelta = isDraw ? 0 : isWin ? (d.elo_change ?? 0) : -(d.elo_change ?? 0);

    const raw = d.finished_at ? new Date(d.finished_at) : null;
    const date = raw
      ? raw.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      : "—";

    return {
      id: d.id,
      topic: d.topic,
      sideA: d.side_a_label,
      sideB: d.side_b_label,
      userSide: isA ? "A" : "B",
      result,
      eloDelta,
      crowdCount: (d.votes_a ?? 0) + (d.votes_b ?? 0),
      date,
    };
  });

  // ── Join date ─────────────────────────────────────────────────────────────────
  const joinDate = new Date(user.created_at).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });

  return NextResponse.json({
    username: profile.username,
    name: profile.name || profile.username,   // profiles.name is canonical; username is fallback
    country: profile.country ?? null,
    club: profile.club ?? null,
    elo: profile.elo ?? 1200,
    wins: myWins,
    losses: profile.losses ?? 0,
    draws: profile.draws ?? 0,
    debates_count: profile.debates_count ?? 0,
    rank,
    totalDebaters: totalDebaters ?? 0,
    joinDate,
    username_changed_at: profile.username_changed_at ?? null,
    avatar_url: profile.avatar_url ?? null,
    upvotes_received: profile.upvotes_received ?? 0,
    mvp_count: profile.mvp_count ?? 0,
    debates: debateHistory,
  });
}
