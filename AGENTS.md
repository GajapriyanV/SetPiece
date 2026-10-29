# SetPiece contributor instructions

## Current cutover authorization (2026-10-29)
- The user explicitly approved replacing the broken hosted Node service with Go on the existing Railway service and switching the existing Vercel frontend. Upstash was deleted; do not recreate it. This approval supersedes earlier production gates below for this cutover only.
- Work is on setpiece-go-production, based on origin/master af41083 (merged overhaul). Preserve the original debate-features checkout.
- Production uses PRODUCTION_DATABASE_URL/PRODUCTION_PROJECT_REF, restricted setpiece_app, verified TLS and remote LIVEKIT_* with one replica (free-plan sleeping accepted by the user). See backend/PRODUCTION.md for deployment/drain/rollback. Never run fixture SQL on Supabase. Legacy code removal and unfinished browser acceptance remain separate work.

## Scope and approval
- Read [ARCHITECTURE.md](ARCHITECTURE.md) and [MIGRATION_PLAN.md](MIGRATION_PLAN.md) before backend work.
- The user approved milestones 1, 2A, 2B and 3A on 2026-10-10, including 15-second restart recovery and first-vote-final semantics. Those initial room/voting milestones restricted writes to isolated local databases; phase 3B was approved on 2026-10-11 with an isolated local LiveKit server. Phase 4A was approved on 2026-10-11, including matching personal rank to leaderboard order with a stable user-ID tie-breaker. Phase 4B was subsequently approved, including nested replies capped at depth 20 with same-thread parents. Phase 4C was approved on 2026-10-12 for measured Redis/query/memory improvements. Phase 5 is approved for an integrated local rehearsal first; the user confirmed no separate staging project and approved continued local preparation. The Linux container rehearsal passed on 2026-10-16; signed-in staging acceptance is still open. Production deployment/cutover and legacy retirement remain separate approval gates. The user approved the next local security/ownership readiness slice on 2026-10-16. Milestone 1's outstanding browser/legacy checks remain open. The user subsequently confirmed the existing Supabase project has no live users and approved reusing it for development migration while preserving its data (2026-10-17); a second project is not required for this slice.
- Once approved, work incrementally within the authorized milestone; update documentation when verified behavior or decisions change.
- Preserve unrelated changes and branches. The overhaul baseline is master commit 8333e70; unfinished debate-features handoff/layout work is excluded.
- Keep deferred features deferred, including early turn handoff and camera/video support, unless explicitly requested.

## Architecture
- Keep the existing Next.js frontend at repository root. The Go foundation is under backend/; its authenticated profile reader is implemented behind disabled-by-default Next.js forwarding. Retain server/ until validated cutover.
- Retain Supabase PostgreSQL/Auth, Supabase Storage for avatars, LiveKit media, Vercel frontend hosting, and Railway backend hosting.
- Use one Go process/replica initially: net/http, pgx pooling, a maintained WebSocket library, and the maintained LiveKit Go SDK.
- Separate HTTP/WebSocket transport, business services, and persistence. Both transports call the same business services.
- PostgreSQL owns durable votes, results, ratings, and recoverable lifecycle state. In-memory Go structures own connections/presence.
- Redis is essential to the legacy implementation; remove dependencies only after every consumer has a replacement. Go room lifecycle is opt-in via LIFECYCLE_DATABASE_URL. Fixture profile writes use PROFILE_DATABASE_URL (development-only loopback setpiece_m4_*); never point fixture or application-write tests at the existing application database. NEXT_PUBLIC_PROFILE_BACKEND=go selects the opt-in profile frontend. COMMUNITY_DATABASE_URL uses the same local guard and must equal PROFILE_DATABASE_URL when both are set; NEXT_PUBLIC_COMMUNITY_BACKEND=go also selects Go profiles. See backend/schema/COMMUNITY.md.
- DEVELOPMENT_DATABASE_URL plus DEVELOPMENT_PROJECT_REF enables the explicitly matched existing Supabase development project: loopback Go listener, verified TLS, session/direct port 5432, restricted setpiece_app login, one shared pool and all other database URLs unset. cmd/developdb requires a matching verified backup manifest and explicit administrator file; never use test fixtures on this project. See backend/DEVELOPMENT.md.
- REHEARSAL_DATABASE_URL unifies all modules on one pool only in development, on 127.0.0.1/setpiece_m5_* with exactly sslmode=disable and every other database URL unset. Never use Supabase for fixtures. Explicit cmd/migrate applies checked migrations while the runtime is stopped; startup never applies DDL. See backend/DEPLOYMENT.md.
- Preserve regular/featured rooms, forum, profiles, rankings, notifications, support, and moderation; avoid unnecessary UI redesign.
- Do not introduce microservices, Kafka, Kubernetes, gRPC, Terraform, a custom gateway/media server, or a full observability stack.

## Correctness and security
- Inspect the deployed schema, constraints, RLS, functions, triggers, and connection mode before designing SQL migrations. Repository queries are not schema proof.
- Use additive migrations, parameterized SQL, bounded queries, transactions, and database constraints.
- All running lifecycle writes must use owned repositories: migration 0004 and internal/ownership fence room/vote transactions before domain row locks. Lease loss stops the process; never silently reacquire or bypass the token. The local permission candidate in backend/security/local-cutover.sql is fixture-only and must not run against Supabase; see backend/SECURITY.md.
- Serialize voting against closure; make retries and finalization safe; publish only committed state. Do not rely on process mutexes for vote uniqueness.
- Keep verified forum counter/notification triggers authoritative; Go owns transactional closure/MVP with its private ledger. Do not call the legacy close_thread_if_expired RPC from Go or duplicate trigger effects.
- Treat conflicting product behavior as a documented decision, not an invitation to silently change it.
- Validate Supabase tokens using trusted project keys, issuer, audience, expiry, subject, and allowed algorithms; preserve session refresh flows.
- Enforce ownership, membership, and admin permissions in Go; privileged database access may bypass RLS.
- Keep service-role, database, Redis, LiveKit secrets and bearer tokens out of browser code, logs, and committed files.
- Make room concurrency, disconnect grace, multi-tab membership, bounded queues, origin checks, heartbeats, and reconnect snapshots explicit.
- Keep LiveKit publish permissions synchronized with authoritative phases; media parity is required before room cutover.

## Workflow and validation
- Inspect actual callers and both event maps before changing contracts: types/socket.ts and server/src/types/events.ts.
- Prefer rg for repository searches. Do not edit generated assets, lockfiles, or dependency trees without a task-related reason.
- Existing commands: root npm run lint / npm run build; server npm run build. The baseline has no automated tests; this milestone adds Go tests and root npm run test:profile / npm run test:stats / npm run test:realtime / npm run test:room-state / npm run test:accounts / npm run test:community / npm run test:efficiency.
- Read-only typechecks after dependencies exist: root npx tsc --noEmit --incremental false; server npx tsc -p server/tsconfig.json --noEmit --incremental false.
- For Go changes in backend/, use gofmt, go test ./..., go vet ./..., and race/integration tests where concurrency or persistence changes. SETPIECE_TEST_DATABASE_URL, SETPIECE_LIFECYCLE_TEST_DATABASE_URL, SETPIECE_VOTING_TEST_DATABASE_URL and SETPIECE_REALTIME_TEST_DATABASE_URL must point only to their guarded disposable test databases. Account/community fixtures use SETPIECE_ACCOUNT_TEST_DATABASE_URL / SETPIECE_COMMUNITY_TEST_DATABASE_URL with fresh setpiece_m4_test_* databases. Performance fixtures use SETPIECE_PERFORMANCE_TEST_DATABASE_URL with a fresh loopback setpiece_m4_perf_* database. Integrated rehearsal uses SETPIECE_REHEARSAL_TEST_DATABASE_URL with a NEW EMPTY loopback setpiece_m5_test_* database; backend/scripts/rehearse.cjs provisions and stops its own synthetic cluster. Never use the application database for integration fixtures. Linux container acceptance uses backend/scripts/container-smoke.py with a local Unix-socket Docker engine and fresh synthetic loopback PostgreSQL; it never loads .env.
- Test authorization, transaction rollback, duplicate requests, finalization, reconnects, timers, and LiveKit parity; distinguish static checks from live-service validation.
- Never claim deployment or database behavior was verified without evidence. Report checks run, limitations, and remaining acceptance criteria.
