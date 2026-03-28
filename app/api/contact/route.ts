import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to contact support." }, { status: 401 });

  const body = await request.json();
  const { subject, message } = body;

  if (!subject?.trim() || !message?.trim()) {
    return NextResponse.json({ error: "Subject and message are required." }, { status: 400 });
  }
  if (message.trim().length > 2000) {
    return NextResponse.json({ error: "Message too long." }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, username")
    .eq("id", user.id)
    .single();

  const name = profile?.name || profile?.username || "Unknown";
  const email = user.email ?? "";

  const { error: dbError } = await supabase.from("contact_tickets").insert({
    user_id: user.id,
    name,
    email,
    subject: subject.trim(),
    message: message.trim(),
  });

  if (dbError) return NextResponse.json({ error: "Failed to submit." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
