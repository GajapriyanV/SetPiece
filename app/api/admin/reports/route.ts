import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("filter") ?? "unreviewed"; // unreviewed | all

  let query = supabase
    .from("forum_reports")
    .select("id, target_type, target_id, reason, custom_reason, is_reviewed, created_at, reporter:profiles!reporter_id(username, avatar_url)", { count: "exact" })
    .order("created_at", { ascending: false });

  if (filter === "unreviewed") {
    query = query.eq("is_reviewed", false);
  }

  const { data: reports, count } = await query.limit(100);

  // For reply reports, look up the parent thread_id so we can link directly
  const replyIds = (reports ?? [])
    .filter((r) => r.target_type === "reply")
    .map((r) => r.target_id);

  let replyThreadMap: Record<string, string> = {};
  if (replyIds.length > 0) {
    const { data: replyRows } = await supabase
      .from("forum_replies")
      .select("id, thread_id")
      .in("id", replyIds);
    replyRows?.forEach((row) => { replyThreadMap[row.id] = row.thread_id; });
  }

  const enriched = (reports ?? []).map((r) => ({
    ...r,
    thread_id: r.target_type === "reply" ? (replyThreadMap[r.target_id] ?? null) : null,
  }));

  return NextResponse.json({ reports: enriched, total: count ?? 0 });
}
