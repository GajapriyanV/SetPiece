import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // `next` lets callers specify a post-auth destination (e.g. /rooms)
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/?error=missing_code`);
  }

  const supabase = await createClient();

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    console.error("[auth/callback] exchange error:", exchangeError.message);
    return NextResponse.redirect(`${origin}/?error=auth_failed`);
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/?error=no_user`);
  }

  // Check whether a profile row with a username already exists
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    // Seed a minimal profile row from whatever Google gave us
    const meta = user.user_metadata ?? {};
    await supabase.from("profiles").insert({
      id: user.id,
      name: meta.full_name ?? meta.name ?? null,
    });
    // Send them to the profile-completion step
    return NextResponse.redirect(`${origin}/register?complete=1`);
  }

  if (!profile.username) {
    // Row exists but no username set yet — still needs completion
    return NextResponse.redirect(`${origin}/register?complete=1`);
  }

  // Fully set up — send them where they were going
  return NextResponse.redirect(`${origin}${next}`);
}
