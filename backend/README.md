# Go backend

The Go foundation and authenticated profile read are implemented. Next.js forwarding is opt-in and defaults to the legacy GET. The user confirmed profile loading in the local Go-enabled preview; full token-refresh, profile-edit and legacy-room checks remain open. No production deployment or application-database schema migration has occurred. Phases 2A/2B add isolated local [room lifecycle](schema/ROOM_LIFECYCLE.md) and [transactional voting/results](schema/VOTING.md). Phases 3A/3B add [WebSocket transport](REALTIME_PROTOCOL.md) and opt-in [local media/frontend integration](MEDIA.md).

## Local setup

Install Go 1.26.8 or newer. From backend/, copy .env.example to .env and fill the settings locally; process variables take precedence. The process loads .env by default; use -env-file= to disable it.

Supabase is the existing PostgreSQL database. DATABASE_URL connects pgx to that same database using its PostgreSQL credentials, separate from Supabase HTTP API keys. The local setup uses the Session pooler because direct IPv6 access is unavailable. Use sslmode=verify-full; if required, download the project's CA from Supabase's Connect panel, keep it under ignored certs/, and add an URL-encoded absolute sslrootcert path to the URI. Never disable certificate verification.

~~~sh
go run ./cmd/server
~~~

- GET /health returns liveness.
- GET /ready requires a configured profile reader and a successful database ping.
- GET /api/profile/me verifies the user's Supabase bearer token and returns profile, rank, total debaters, join date and latest 20 finished debates. Invalid tokens receive 401, missing profiles 404, and unavailable database/signing keys 503.
- Responses are non-cacheable. Queries have bounded timeouts; shutdown drains requests within ten seconds.
- The pool uses read-only defaults, UTC timestamp serialization and a three-second statement timeout. These safeguards do not replace a scoped database role.
- PROFILE_TIME_ZONE optionally sets an IANA zone for human-readable dates; otherwise the backend's local zone is used. Match the Next.js server's timezone.
- Default profile writes and legacy rooms remain in their existing implementations. Phases 4A/4B provide guarded local write paths. Opt-in Go lifecycle/realtime/media slices are documented below.

For production, inject variables, set APP_ENV=production, HOST=0.0.0.0, exact HTTPS ALLOWED_ORIGINS and verified TLS. Provision a scoped runtime database role with the SELECT grants described in [the schema contract](schema/PROFILE_READ.md); the current local credential is privileged. Deployment is outside this milestone.

## Next.js forwarding and rollback

Set these server-only variables when starting Next.js at the repository root:

~~~dotenv
PROFILE_READ_BACKEND=go
GO_API_URL=http://127.0.0.1:3002
~~~

Next.js validates the existing cookie user/session and forwards only that user's access token. Go validates it independently. The URL must be HTTPS, except loopback HTTP in development; forwarding rejects redirects and has a bounded timeout/body size.

Unset PROFILE_READ_BACKEND (or set it to legacy) and restart Next.js to restore the existing GET. No database rollback is needed. There is no automatic fallback on backend errors. This old read-only flag does not select Go PATCH or onboarding. The broader phase 4A/4B flags below select those paths together.

The earlier local preview used process-only Go forwarding. Check the flags of any newly started process; builds do not configure an already-running preview.

## Verified database evidence

On 2026-10-10, metadata inspection succeeded against the same Supabase project through its Session pooler with verified TLS. The project's public JWKS exposes ES256 keys. The profile and history queries also passed a read-only PREPARE check. See [schema/PROFILE_READ.md](schema/PROFILE_READ.md) for verified columns, constraints, grants, RLS, triggers and compatibility rules. This is a profile-slice audit, not a full database audit.

~~~sh
go run ./cmd/inspectdb > schema-inspection.local.json
~~~

The inspection command exports schema metadata for profiles/debates/votes, forum/support/notifications, Auth columns, relevant functions/triggers/policies/grants and publication membership, not user records or the connection URI. Keep its export ignored; function definitions can contain application-specific information. Never apply it as a migration.

## Validation

~~~sh
go test ./...
go vet ./...
go test -race ./...
~~~

Set SETPIECE_TEST_DATABASE_URL in the test process only for real SQL fixture tests. It must identify a disposable loopback database named setpiece_m1_test_<suffix>; the users fixture refuses an existing profiles table. These tests create synthetic tables/data and must never target the application database. A disposable test database is not another production database. go test does not load .env automatically.

Optionally set SETPIECE_SCHEMA_DATABASE_URL for the production-query PREPARE check. This check prepares SQL without running fixtures or selecting user rows. It is separate from the disposable integration variable.

From the repository root:

~~~sh
npm run test:profile
npm run test:stats
npx tsc --noEmit --incremental false
npm run build
~~~

Go tests/vet/build, race tests with a portable 64-bit Windows C compiler, and PostgreSQL 16.1 fixture tests passed. Coverage includes JWT claims/key rotation/concurrency, read-only enforcement, cancellation/recovery, caller isolation, ranking/date/history fixtures, HTTP error mapping and graceful shutdown. Frontend tests compare the actual legacy route against the shared fixture and verify forwarding/rollback. TypeScript, targeted ESLint and build passed.

## Remaining acceptance

The signed-in profile loads in the Go-enabled preview. Explicit token-refresh, profile-edit and full legacy-room checks remain open. The configured Upstash hostname currently fails DNS resolution; repair its connection configuration before validating legacy rooms and profile caching. The landing statistics route now returns durable statistics with debatingNow=null during that outage, and the landing UI handles failed/malformed responses safely. No room implementation was migrated as part of that fix.

Keep phase 1 acceptance open until those live checks pass. Phases 2A/2B are authorized and implemented in isolation. Phases 3A/3B are also authorized locally; phases 4A/4B are authorized and locally verified. Phase 4C is also authorized for measured local improvements. Phase 5 is approved for an integrated local rehearsal first; production deployment and retirement remain separate gates.

## Local realtime transport (phase 3A)

With the guarded LIFECYCLE_DATABASE_URL configured, the runtime now exposes POST /api/realtime/ticket and GET /api/realtime/ws. See [REALTIME_PROTOCOL.md](REALTIME_PROTOCOL.md) for authentication, command/snapshot contracts, bounds and isolated tests. The default Socket.io frontend remains active. Phase 3B wires lib/realtime/client.ts for explicitly routed Go rooms and adds local LiveKit integration. See [MEDIA.md](MEDIA.md) for setup and pending browser acceptance. No production cutover occurred.

## Phase 4A profiles/rankings

See [schema/ACCOUNTS.md](schema/ACCOUNTS.md). NEXT_PUBLIC_PROFILE_BACKEND=go coherently opts the frontend into canonical Go profile/ranking/statistics reads and profile/onboarding writes. Default remains legacy; authenticated writes return unavailable unless PROFILE_DATABASE_URL is a guarded disposable local database. Do not enable it against the application database. Account fixture tests use SETPIECE_ACCOUNT_TEST_DATABASE_URL with a fresh setpiece_m4_test_* database.

The SQL/race/backend checks, 34 frontend regressions, TypeScript and both Go/legacy production builds passed. Signed-in browser acceptance and production privilege hardening remain pending.

## Phase 4B community APIs

See [schema/COMMUNITY.md](schema/COMMUNITY.md) before configuring this slice. NEXT_PUBLIC_COMMUNITY_BACKEND=go selects community and canonical profile/account forwarding together. Set GO_API_URL to the local Go server and COMMUNITY_DATABASE_URL only to a prepared disposable development database; if PROFILE_DATABASE_URL is also set, both URIs must match. Startup requires the closure ledger; it never applies DDL.

Community integration tests use SETPIECE_COMMUNITY_TEST_DATABASE_URL with a NEW EMPTY loopback setpiece_m4_test_* database. They install synthetic schema and retained deployed trigger definitions, then migration 0003. This fixture is not a production bootstrap script. Run npm run test:community at repository root for the frontend regressions. Real signed-in flows and Supabase notification delivery remain staging gates.

## Phase 4C efficiency

See [PERFORMANCE.md](PERFORMANCE.md) for measured seasonal ranking improvements, chat memory/rate bounds and the remaining Redis consumers. The Go runtime needs no Redis; the legacy Node runtime still does. No new cache/index or production migration was added. SETPIECE_PERFORMANCE_TEST_DATABASE_URL is test-only and requires a NEW EMPTY loopback setpiece_m4_perf_* database; never point it at Supabase. Root npm run test:efficiency checks statistics concurrency and controlled Redis-outage isolation.

## Phase 5 integrated local rehearsal

Run `node scripts/rehearse.cjs --race` from backend/ with PostgreSQL tools and Go available. Set PG_BIN and GO_BIN to tool locations if they are not on PATH; --race also requires a supported C compiler. This command creates a fresh loopback PostgreSQL cluster with synthetic data, runs the actual composition root with local signed JWTs, reruns controlled migrations and checks a dump/restore. It stops its cluster afterward and retains artifacts for inspection. No .env file is loaded.

REHEARSAL_DATABASE_URL is the development-only shared-store switch; DATABASE_URL, PROFILE_DATABASE_URL, COMMUNITY_DATABASE_URL and LIFECYCLE_DATABASE_URL must all be unset. The migration command is `go run ./cmd/migrate -env-file=` with explicit rehearsal environment settings and the server stopped. It is not a production bootstrap command. See [DEPLOYMENT.md](DEPLOYMENT.md) for prerequisites, deployment preparation and remaining acceptance gates. On Linux/WSL with Python 3, OpenSSL and a local Docker engine, run `python3 scripts/container-smoke.py` to build and verify the actual image against fresh synthetic PostgreSQL/TLS fixtures. The local container rehearsal passed on 2026-10-16; signed-in staging and production cutover remain open. The integrated rehearsal now also verifies restricted-role permissions and lost-lease shutdown/stale-writer fencing. See [SECURITY.md](SECURITY.md); runtime lifecycle startup requires migration 0004.
