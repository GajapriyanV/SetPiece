# Verified profile-read schema contract

Inspected read-only on 2026-10-10 against the existing Supabase project through its Session pooler with sslmode=verify-full and the CA used by Supabase's dashboard. The full metadata export is local/ignored, not a migration.

- public.profiles: UUID primary key with a foreign key to auth.users(id); username/name/country/club/avatar_url and created_at are nullable. elo, wins, losses, draws, debates_count, username_changed_at, upvotes_received and mvp_count are NOT NULL. Username has a unique constraint. The repository selects only response fields, never is_admin or registration_complete.
- auth.users: id is UUID and created_at is nullable timestamptz. Only the requesting user's creation date is selected; no email, password hash, token or metadata is returned.
- public.debates: UUID primary key; text topic/side labels/status are NOT NULL; speaker IDs, winner_id, result, elo_change and finished_at are nullable. Speaker/winner foreign keys use ON DELETE SET NULL. Status and result are constrained text, not enums.
- public.votes: UNIQUE(debate_id,user_id) already exists; side is constrained to a/b. No vote changes belong to this milestone.
- Profiles, debates and votes have RLS enabled (not forced) and public SELECT policies using true. The inspected postgres role bypasses RLS. The Go reader therefore binds the verified JWT subject explicitly for the profile/Auth join and history, while aggregate ranking reads match the existing public policies.
- No custom triggers were present on these three public tables. This does not audit Auth triggers, forum functions or the rest of the schema.
- Only primary-key/username/vote-uniqueness indexes were present on these tables. No speculative indexes or other schema changes were applied.

Compatibility rules:
- Preserve wins descending, losses ascending, debate count descending and OTHER profile.created_at earlier than the requesting AUTH account.created_at. Do not replace this with Elo or normalize the legacy timestamp mismatch.
- Preserve nullable profile fields, name-to-username fallback, latest 20 finished debates, null finish dates first under descending PostgreSQL ordering, zero draw Elo delta, and en-GB month names (including Sept).
- Format username_changed_at through PostgreSQL JSON in UTC, matching PostgREST's timestamp representation.
- Human-readable dates use the backend's local timezone by default, matching the legacy server-side Intl behavior. Set PROFILE_TIME_ZONE if Go and Next.js run in different timezones.
- A repeatable-read, read-only transaction gives the profile/rank/history a consistent snapshot. Database errors return a bounded 503 instead of silently manufacturing empty history or rank=1.
- Application SQL needs SELECT on the relevant profile/debate fields and auth.users(id,created_at). The development credential is privileged; provision a scoped runtime credential before production deployment. Read-only connection defaults are an additional safeguard, not an authorization boundary.
