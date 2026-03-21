import type { User } from "@supabase/supabase-js";

interface ProfileShape {
  name?: string | null;
  username?: string | null;
}

/**
 * Canonical display name resolution.
 *
 * Source of truth (in priority order):
 *   1. profiles.name        — set during registration / editable in profile settings
 *   2. profiles.username    — always present after onboarding
 *   3. user_metadata        — fallback for existing users / seed only, never written post-registration
 *   4. email prefix         — last resort
 */
export function getDisplayName(
  profile: ProfileShape | null | undefined,
  user?: User | null
): string {
  return (
    profile?.name ||
    profile?.username ||
    user?.user_metadata?.username ||
    user?.email?.split("@")[0] ||
    "User"
  );
}
