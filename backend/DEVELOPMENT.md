# Existing Supabase development project

The user confirmed this project has no live users and authorized reusing it with existing data preserved. Supabase remains the database, Auth and avatar Storage provider. Local Go replaces application APIs and room ownership; LiveKit remains isolated locally for acceptance. Production deployment and removal of the legacy runtime are separate work.

## Preparation and backup

The read-only audit found PostgreSQL 17.6, ten public application tables, no existing setpiece_runtime schema or setpiece_app role, no active live/voting debates, no invalid parent links and no duplicate MVPs. The historical reply tree reaches depth five, with no unreachable/cyclic components. Existing records include 9 profiles, 72 debates, 3 forum threads and 18 replies. Keep all records.

A private custom-format PostgreSQL 17 archive includes the public, auth and storage schemas and their data. It is stored outside Git under the user's LocalAppData/SetPiece/backups/development-20261016 directory, alongside the schema/privilege inventory, public row fingerprints, configuration backups and SHA-256 manifest. It contains sensitive Auth/application data. Storage object bytes are not included; this change does not modify or delete those objects.

The archive restored into a disposable PostgreSQL 17 container with prerequisite roles and extensions, restoring ACLs but excluding original ownership. All ten public tables matched source counts and row fingerprints. This establishes archive readability and application-data restoration, not a complete Supabase platform recovery or original-owner reconstruction.

## Controlled application

cmd/developdb requires an explicit ignored admin environment file, the confirmed project reference and a matching manifest with a verified archive hash/local restore. Its default invocation is read-only preflight. Add -apply only for the authorized development change. It rejects production mode, mismatched projects, non-admin migration users, transaction pooling, unverified TLS and URI overrides.

From backend/, after reviewing the backup and stopping the runtime:

~~~text
go run ./cmd/developdb -env-file .env.development-admin.local -project <confirmed-reference> -backup-manifest <private-backup-directory>/manifest.json
~~~

The administrator file contains APP_ENV=development, SUPABASE_URL, DATABASE_URL and a freshly generated DEVELOPMENT_RUNTIME_PASSWORD of at least 32 characters. It is ignored, separate from runtime configuration and must not be logged. The four checked migrations apply atomically with their ledger; the role/grant installation then runs in a separate transaction. If the latter fails, additive migrations may already be recorded. Inspect state before retrying. Existing runtime roles are deliberately not overwritten.

The permission installation creates setpiece_app without superuser, BYPASSRLS, role/database creation or inherited memberships. It grants explicit application columns/actions and RLS policies, revokes public application mutation grants from anon/authenticated/service_role (including column grants), and removes client access to the legacy closure RPC. Existing trigger functions retain their effects with a hardened search_path. It does not change managed Auth/Storage policies or their data.

The actual postgres administrator cannot delegate USAGE on auth. Instead, setpiece_runtime.contact_identities is an owner-rights, security-barrier view exposing only id/email to the restricted runtime for support tickets. Browser/service roles cannot access it. Go still binds queries to the verified user's identity. Canonical profile reads use public.profiles; direct Auth access is unnecessary in this mode.

## Runtime and preview

backend/.env uses APP_ENV=development, HOST=127.0.0.1, PORT=3002, matching SUPABASE_URL and DEVELOPMENT_PROJECT_REF, and DEVELOPMENT_DATABASE_URL for setpiece_app over port 5432 with sslmode=verify-full. Set the public CA file via sslrootcert when needed. Leave DATABASE_URL, PROFILE_DATABASE_URL, COMMUNITY_DATABASE_URL, LIFECYCLE_DATABASE_URL and REHEARSAL_DATABASE_URL unset. At least two pool connections are required; the configured five include the dedicated ownership lease. No startup DDL runs.

The frontend keeps its existing Supabase Auth/public configuration and selects all three Go flags: NEXT_PUBLIC_ROOM_BACKEND, NEXT_PUBLIC_PROFILE_BACKEND and NEXT_PUBLIC_COMMUNITY_BACKEND. GO_API_URL and NEXT_PUBLIC_GO_HTTP_URL point to the local Go origin; NEXT_PUBLIC_GO_WS_URL uses its /api/realtime/ws endpoint. Restart the development frontend after configuration changes. This is a local preview, not hosted production settings.

LOCAL_LIVEKIT_* remains restricted to ws://127.0.0.1 and an isolated local server. No production media service is selected automatically.

## Validation and recovery

The guarded TestRestoredDevelopmentDatabase accepts only a disposable loopback database named setpiece_m5_test_restore on port 55439. It never loads .env or inserts test users into Supabase. It verifies unchanged existing rows after migration, migration rerun, role scope, legacy permission denials, canonical profile reads, the private contact view, ownership acquisition and retained forum triggers on the local copy.

Do not run the synthetic bootstrap or fixture permission script on this project. Do not restore a backup over the existing database as an automatic rollback. If a preview fails, stop Go and inspect logs while preserving additive schema and committed data. Reverting frontend flags alone is insufficient after legacy write grants have been revoked; review the saved ACL inventory and coordinate any grant rollback explicitly. Keep the unsafe legacy closure RPC disabled.

Signed-in Profile/Forum loading and page refresh are confirmed by the user. OAuth/reset/onboarding, token-expiry refresh, profile edits/avatars, real notification delivery and multi-user microphone/room flows remain acceptance work. Local SQL tests and anonymous HTTP checks do not establish that acceptance. Hosted deployment, network partition/provider behavior and legacy retirement remain open.

## Execution record

On 2026-10-17, the restored-copy tests passed, then all four migrations and the development permissions were applied to the authorized existing project. All ten public application tables retained identical counts and row fingerprints immediately afterward. Four migration records are present; setpiece_app connects through the session pooler with verified TLS, has no privileged flags or inherited memberships, and cannot update is_admin, create public objects or access auth directly. Effective anon/authenticated/service_role table/column mutations and legacy closure RPC access are absent. Auth/Storage schema/table grants, RLS settings and policies match the saved pre-migration inventory.

The local preview runs on http://localhost:3000, Go on 127.0.0.1:3002 and isolated LiveKit on 127.0.0.1:7880. Go health/readiness/rooms/forum/rankings and frontend landing/statistics/forum/rankings returned 200; anonymous profile requests returned 401 in both paths. Responses expected to be JSON parsed successfully. No fixture users, rooms, votes or forum records were inserted into Supabase. Startup updates the private ownership token as designed. The user confirmed that signing in, opening Profile and Forum, and refreshing both works without errors. This confirms those specific browser paths; OAuth/reset/onboarding, profile edits/avatar uploads, notifications and multi-user room/audio flows remain open.

The full backend race suite, vet and builds passed for the runtime/configuration changes; the restored-copy integration additionally verified migration reruns, data preservation, least-privilege denials, canonical profile reads, the private support identity view, ownership acquisition and all three retained forum triggers. Final verification on 2026-10-17: the full backend race suite (including the new configuration/backup guards), go vet and go build passed. The updated Linux image sha256:54127a83f337e97267cb7d3be451df61c470f305733ecbba42d2fa9d0bf00329 passed isolated container checks for non-root/read-only execution, verified and negative TLS, health/readiness, database outage recovery, restart and runtime file inventory; graceful shutdown took 0.498 seconds. These container fixtures remain synthetic and do not establish hosted writable/media acceptance. The original checkout retains its eight unrelated changes (183 additions/57 deletions). No deployment, commit, push or legacy deletion occurred. The local preview remains running.

On 2026-10-17 the acceptance continuation recovered the stopped preview, corrected local media isolation, fixed initial notification outage recovery, and passed frontend/build and actual local RTP/room integration checks. See [ACCEPTANCE.md](ACCEPTANCE.md) for evidence and unconfirmed browser checks.

Latest user confirmation (2026-10-17): display-name saving and avatar upload/refresh both work. Only one account is currently available; three-account browser audio/voting and cross-account notification delivery remain pending. See the one-account checks in [ACCEPTANCE.md](ACCEPTANCE.md).
