import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const supabase = await createClient();

  // ── Profile ───────────────────────────────────────────────────────────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, name, country, club, elo, wins, losses, draws, debates_count, avatar_url, created_at, upvotes_received, mvp_count")
    .eq("username", username)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // ── Global rank ───────────────────────────────────────────────────────────────
  const myWins = profile.wins ?? 0;
  const { count: aboveCount } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .gt("wins", myWins);
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
    .or(`debater_a_id.eq.${profile.id},debater_b_id.eq.${profile.id}`)
    .order("finished_at", { ascending: false })
    .limit(20);

  const debateHistory = (debates ?? []).map((d) => {
    const isA = d.debater_a_id === profile.id;
    const isDraw = d.result === "draw";
    const isWin = !isDraw && d.winner_id === profile.id;
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
  const joinDate = new Date(profile.created_at).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });

  return NextResponse.json({
    username: profile.username,
    name: profile.name || profile.username,
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
    avatar_url: profile.avatar_url ?? null,
    upvotes_received: profile.upvotes_received ?? 0,
    mvp_count: profile.mvp_count ?? 0,
    debates: debateHistory,
  });
}
