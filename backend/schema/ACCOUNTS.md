# Phase 4A profiles and rankings

Implemented and locally verified on setpiece-v2-overhaul. No production write switch is enabled.

## Verified schema (2026-10-11)

The read-only inspector verified profiles.updated_at, registration_complete and is_admin, their defaults, the exact case-sensitive username unique constraint, and no custom profiles/Auth-user triggers. Avatar bucket is public; authenticated object insertion/update is constrained to the first path segment matching auth.uid(). Bucket MIME and size limits are unset; the existing browser checks images and 2 MB. No user records or storage objects were modified during inspection.

Existing profile RLS restricts row ownership, not which columns a user can update. Production cutover MUST remove direct application-profile writes or add equivalent column/trigger enforcement after auditing the remaining legacy/forum callers. Go's strict field allowlist does not close the existing Supabase API bypass by itself. No speculative production DDL is applied in 4A. Phase 5 now reproduces and blocks this bypass in a synthetic restricted-role rehearsal; see [../SECURITY.md](../SECURITY.md). Production grants remain unchanged.

## Contracts and guards

- NEXT_PUBLIC_COMMUNITY_BACKEND=go also enables canonical Go profiles and shares the guarded application database (see COMMUNITY.md).
- NEXT_PUBLIC_PROFILE_BACKEND=go selects Next.js forwarding and client edits/onboarding together. Default is legacy. PROFILE_READ_BACKEND=go remains the old read-only milestone independently.
- DATABASE_URL remains a read-only pool. PROFILE_DATABASE_URL may enable writes only in development against 127.0.0.1/setpiece_m4_* with sslmode=disable and no extra query parameters. All account/profile/ranking reads then use that same local pool, avoiding local-write/live-read divergence. No startup schema mutations occur.
- Verified Supabase subject supplies the owner; no client user ID, Elo, admin, counters, timestamps or registration flag is accepted. Browser Auth email/password/OAuth/metadata operations and direct avatar Storage upload remain Supabase operations.
- PATCH is a full profile form (name, username, country, club, avatar_url). Strings are trimmed/checked; names and country/club are bounded at 100 Unicode code points, usernames at 64 without control characters or route delimiters. Country/club catalogue remains the UI source, rather than a second embedded catalogue.
- Username uniqueness preserves case sensitivity. Changes serialize on the owner row; PostgreSQL clock enforces 14 days; same-username retries succeed. New names may be assigned on first completion. Successful onboarding retries return committed truth without overwriting later edits or Elo.
- Newly assigned avatars must be in the authenticated user's avatars folder on the configured Supabase origin. Unchanged historical URLs are retained. Storage policies remain responsible for object access; no external uploads were tested.
- Legacy PATCH refreshes Redis from the committed profile row, never caller-supplied cache fields. Isolated Go writes do not update production Redis. Legacy-room cache bridging at eventual cutover remains a reviewed integration gate.
- HTTP validates JSON fields/body limits, auth, origin and timeouts. Next.js verifies/refreshed cookie identity and matches the session before forwarding its access token. No mutation falls back or automatically replays against legacy on failure.

## Ranking and date policy

User approved matching personal rank to the corresponding leaderboard on 2026-10-11. One SQL calculation powers list/personal ranks, with ID ascending as final tie-breaker.

- All-time unranked: wins descending, losses ascending, debate count descending, profile creation ascending (null last).
- Seasonal unranked: wins descending, rounded win percentage descending, season debate count descending, profile creation ascending (null first, preserving the prior list).
- Ranked: current Elo descending, corresponding debate count descending, creation ascending with the same period-specific null rule.
- Season begins at 2026-01-01T00:00:00Z; aggregate finished debates directly in SQL, including zero-activity profiles. Elo is current Elo, not a historical season snapshot. Malformed legacy records with a winner outside both participants are excluded from season totals.
- Page size 20; pages 1..100000. Regional access needs auth; missing country produces an empty list and null personal rank.
- Both canonical profile views use all-time global unranked rank and profiles.created_at for the join date. This deliberately fixes the Auth/profile timestamp discrepancy. PROFILE_TIME_ZONE controls dates and landing day boundaries; set explicitly (e.g. UTC) before deployment. Missing join dates retain the existing private formatter's Invalid Date.
- History remains latest 20 finished debates with legacy result/date/Elo approximation semantics. Phase 2B's signed private result ledger is not retroactively inferred for old debates.
- Durable landing totals aggregate inside PostgreSQL. The live count still comes from the chosen room runtime; an outage returns null, never counts from a different runtime.

## Validation and remaining gates

Passed: disposable PostgreSQL tests under race detector (45 profiles, all eight filter combinations, four pages, 1,105 season debates, private/public profile parity, concurrent username claims, retry/cooldown, injected rollback, avatar path ownership, protected JSON fields, onboarding defaults/retry); full Go race suite plus old profile SQL fixture; vet/build; TypeScript; 34 frontend tests across all slices; Go-enabled and legacy-default production builds; targeted lint (three preexisting image warnings). Test PostgreSQL stopped afterward.

Final corrections are applied: /api/account helper namespace avoids username collisions; null regional ranks render a placeholder and mode-aware requests discard stale responses.

Pending: signed-in Auth/onboarding/avatar UI acceptance, deployed RLS hardening and legacy cache integration before production. No actual Auth emails, storage writes, profile writes or database schema mutations were performed against Supabase.
