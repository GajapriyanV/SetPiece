import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  // Lazily close thread if expired (idempotent RPC)
  await supabase.rpc("close_thread_if_expired", { p_thread_id: id });

  // Fetch thread
  const { data: thread } = await supabase
    .from("forum_threads")
    .select("id, title, body, flair, is_featured, is_closed, upvotes_count, reply_count, created_at, closes_at, author:profiles!author_id(id, username, name, avatar_url)")
    .eq("id", id)
    .single();

  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

  // Fetch all replies for this thread
  const { data: allReplies } = await supabase
    .from("forum_replies")
    .select("id, parent_reply_id, body, upvotes_count, is_mvp, created_at, author:profiles!author_id(id, username, name, avatar_url)")
    .eq("thread_id", id)
    .order("created_at", { ascending: true });

  // Get current user's likes (if authenticated)
  const { data: { user } } = await supabase.auth.getUser();
  let likedIds = new Set<string>();
  if (user) {
    const replyIds = (allReplies ?? []).map((r) => r.id);
    const { data: likes } = await supabase
      .from("forum_likes")
      .select("target_id")
      .eq("user_id", user.id)
      .in("target_type", ["thread", "reply"]);
    if (likes) likes.forEach((l) => likedIds.add(l.target_id));
  }

  // Build recursive reply tree
  const buildTree = (all: typeof allReplies, parentId: string | null): object[] =>
    (all ?? [])
      .filter((r) => r.parent_reply_id === parentId)
      .map((r) => ({ ...r, user_liked: likedIds.has(r.id), children: buildTree(all, r.id) }));

  const replies = buildTree(allReplies, null);

  return NextResponse.json({
    thread: { ...thread, user_liked: likedIds.has(id), author_id: undefined },
    replies,
    current_user_id: user?.id ?? null,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { error } = await supabase.from("forum_threads").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Failed to delete thread" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const updates = await request.json();
  const allowed: Record<string, unknown> = {};
  if (typeof updates.is_featured === "boolean") allowed.is_featured = updates.is_featured;
  if (typeof updates.is_closed === "boolean") allowed.is_closed = updates.is_closed;

  const { error } = await supabase.from("forum_threads").update(allowed).eq("id", id);
  if (error) return NextResponse.json({ error: "Failed to update thread" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
