import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: thread_id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { body, parent_reply_id } = await request.json();

  if (!body?.trim()) return NextResponse.json({ error: "Reply body is required" }, { status: 400 });
  if (body.trim().length > 2000) return NextResponse.json({ error: "Reply too long" }, { status: 400 });

  // Verify thread exists and is open
  const { data: thread } = await supabase
    .from("forum_threads")
    .select("is_closed")
    .eq("id", thread_id)
    .single();

  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  if (thread.is_closed) return NextResponse.json({ error: "Thread is closed" }, { status: 400 });

  // If parent_reply_id provided, verify it's a top-level reply (no nesting beyond 1 level)
  if (parent_reply_id) {
    const { data: parent } = await supabase
      .from("forum_replies")
      .select("parent_reply_id")
      .eq("id", parent_reply_id)
      .single();
    if (!parent) return NextResponse.json({ error: "Parent reply not found" }, { status: 404 });
  }

  const { data: reply, error } = await supabase
    .from("forum_replies")
    .insert({
      thread_id,
      author_id: user.id,
      body: body.trim(),
      parent_reply_id: parent_reply_id ?? null,
    })
    .select("id, parent_reply_id, body, upvotes_count, is_mvp, created_at, author:profiles!author_id(id, username, name, avatar_url)")
    .single();

  if (error) return NextResponse.json({ error: "Failed to post reply" }, { status: 500 });
  return NextResponse.json({ reply: { ...reply, user_liked: false, nested: [] } }, { status: 201 });
}
