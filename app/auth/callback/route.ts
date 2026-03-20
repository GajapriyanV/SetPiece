import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
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

  // Use the explicit onboarding flag — never infer from partial data
  if (user.user_metadata?.onboarding_complete === true) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Seed a minimal profile row if one doesn't exist yet
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!existing) {
    const meta = user.user_metadata ?? {};
    await supabase.from("profiles").insert({
      id: user.id,
      name: meta.full_name ?? meta.name ?? null,
    });
  }

  // Registration incomplete — complete the profile
  return NextResponse.redirect(`${origin}/register?complete=1`);
}
