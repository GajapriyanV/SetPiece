import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("filter") ?? "unreviewed";

  let query = supabase
    .from("contact_tickets")
    .select("id, name, email, subject, message, is_reviewed, created_at, user_id", { count: "exact" })
    .order("created_at", { ascending: false });

  if (filter === "unreviewed") {
    query = query.eq("is_reviewed", false);
  }

  const { data: tickets, count } = await query.limit(100);
  return NextResponse.json({ tickets: tickets ?? [], total: count ?? 0 });
}
