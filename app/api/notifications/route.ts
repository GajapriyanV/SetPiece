import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: notifications } = await supabase
    .from("notifications")
    .select(`
      id, type, thread_id, reply_id, is_read, created_at,
      actor:profiles!actor_id(username, avatar_url),
      thread:forum_threads!thread_id(title)
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  return NextResponse.json({ notifications: notifications ?? [], unreadCount: unreadCount ?? 0 });
}

// PATCH /api/notifications — mark all as read
export async function PATCH() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  return NextResponse.json({ ok: true });
}
