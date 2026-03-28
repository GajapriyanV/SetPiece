import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await supabase.from("contact_tickets").update({ is_reviewed: true }).eq("id", id);
  return NextResponse.json({ ok: true });
}
