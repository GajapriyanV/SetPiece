import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: target_id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: existing } = await supabase
    .from("forum_likes")
    .select("id")
    .eq("user_id", user.id)
    .eq("target_type", "reply")
    .eq("target_id", target_id)
    .maybeSingle();

  if (existing) {
    await supabase.from("forum_likes").delete().eq("id", existing.id);
    return NextResponse.json({ liked: false });
  }

  await supabase.from("forum_likes").insert({ user_id: user.id, target_type: "reply", target_id });
  return NextResponse.json({ liked: true });
}
