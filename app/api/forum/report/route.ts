import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

const VALID_REASONS = ["Spam", "Hate speech", "Misinformation", "Harassment", "Off-topic", "Other"];

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { target_type, target_id, reason, custom_reason } = await request.json();

  if (!["thread", "reply"].includes(target_type)) {
    return NextResponse.json({ error: "Invalid target type" }, { status: 400 });
  }
  if (!VALID_REASONS.includes(reason)) {
    return NextResponse.json({ error: "Invalid reason" }, { status: 400 });
  }
  if (reason === "Other" && (!custom_reason?.trim() || custom_reason.trim().length > 200)) {
    return NextResponse.json({ error: "Custom reason required (max 200 chars)" }, { status: 400 });
  }

  const { error } = await supabase.from("forum_reports").insert({
    reporter_id: user.id,
    target_type,
    target_id,
    reason,
    custom_reason: reason === "Other" ? custom_reason.trim() : null,
  });

  if (error) return NextResponse.json({ error: "Failed to submit report" }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
