# Phase 5: local rehearsal and deployment runbook

## Scope

The user approved an integrated local rehearsal first, then continued local preparation because no separate staging project is available. The user subsequently confirmed the existing project is development-only and authorized migrating it while preserving data. That scope is documented in [DEVELOPMENT.md](DEVELOPMENT.md); it does not authorize production deployment or legacy retirement. One existing Supabase PostgreSQL database remains the design.

## Repeat the synthetic rehearsal

Requirements: Node.js 20+, PostgreSQL client/server tools (verified locally with 16.1), and Go compatible with backend/go.mod. The race detector additionally needs a supported C compiler. From backend/:

~~~powershell
$env:PG_BIN = 'C:\Program Files\PostgreSQL\16\bin'
# Optional if Go is not on PATH: $env:GO_BIN = 'C:\path\to\go.exe'
node scripts/rehearse.cjs --race
~~~

The runner creates a fresh temporary cluster listening only on 127.0.0.1, uses synthetic users and local trust authentication, and does not load any .env file. It strips ambient database and local media settings. It runs the actual Go composition root, then the explicit migration command, dumps the synthetic database and restores it to a second disposable database. It stops its PostgreSQL cluster in a finally block and prints the retained artifact directory. Removing --race permits a run without a C compiler, but does not establish race-detector acceptance.

The shared REHEARSAL_DATABASE_URL requires APP_ENV=development, host 127.0.0.1, database name setpiece_m5_*, exactly sslmode=disable, DATABASE_MAX_CONNS >=2, and all other database URLs unset. One pool serves application and lifecycle modules; one connection holds the ownership lease. The integration-test variable SETPIECE_REHEARSAL_TEST_DATABASE_URL further requires an empty setpiece_m5_test_* database. Do not point fixture tests at an existing project.

The integration scenario covers ES256/JWKS verification, anonymous rejection, profile-to-forum visibility, retained counter/notification triggers, support/admin access, three authenticated WebSockets, chat, countdown and six speaking phases, identical vote retries, committed Elo/rank visibility, forum MVP, shutdown/restart and migration exclusion. Test-only deadline changes accelerate the real scheduler. These checks use synthetic JWTs; they do not exercise Supabase browser cookies, OAuth, real microphone access or deployed Realtime delivery.

## Controlled migrations

With the isolated schema baseline prepared, configure SUPABASE_URL, ALLOWED_ORIGINS and REHEARSAL_DATABASE_URL in the process environment, unset other database URLs, stop the runtime, and run from backend/:

~~~sh
go run ./cmd/migrate -env-file=
~~~

There is no implicit .env loading. An explicitly supplied -env-file may load a dedicated local rehearsal file; never use the existing application configuration. Production migration is intentionally unsupported. The synthetic schema under internal/forum/testdata is test input, not a production bootstrap.

The command embeds reviewed migrations 0001–0004, normalizes CRLF to LF for SHA-256 checksums, and records applied files in the private setpiece_migrations.applied ledger. Pending SQL plus ledger changes run in one transaction. Identical reruns are safe, changed recorded files fail, and the runtime advisory lease excludes migration. A failed migration rolls back the entire pending set. Existing manually applied migrations need a separately reviewed ledger adoption procedure; do not insert checksums speculatively. Startup checks schema prerequisites and never applies DDL.

The backup drill uses pg_dump custom format and pg_restore into a separate fresh fixture database, then checks four migration records, one result, one total win and one MVP. It does not establish production RPO/RTO, role/grant restoration, Supabase-managed schema compatibility or provider backups: restore deliberately uses --no-owner --no-privileges.

## Container and Railway preparation

From repository root, on a machine with Docker:

~~~sh
docker build -t setpiece-go:rehearsal backend/
~~~

The multi-stage image compiles a CGO-disabled binary, copies the public CA bundle, runs as UID/GID 65532 and disables .env loading. The allowlisted build context excludes environment files, project certificates, SQL fixtures and test files. A custom database CA must be mounted separately if needed; never bake project credentials into the image. The actual image passed local Linux execution on 2026-10-16, including startup, health/readiness, database TLS, outage recovery and bounded SIGTERM. Builder-only GOMAXPROCS=2, GOMEMLIMIT=512MiB and go build -p 2 limit compilation resource use on smaller machines.

To repeat container acceptance on Linux/WSL, use Python 3 (without -O), OpenSSL and a local Linux Docker engine exposed through a Unix socket. The Docker engine must support host networking and pause/unpause. From backend/:

~~~sh
python3 scripts/container-smoke.py
# To test an image already built:
python3 scripts/container-smoke.py --skip-build --image setpiece-go:rehearsal
~~~

The runner builds the actual Dockerfile by default and pulls postgres:16 if needed. It uses a fresh synthetic database on a random loopback port, local trust authentication and generated short-lived certificates. It does not read project .env files or connect to Supabase. The runtime has a read-only filesystem, all capabilities dropped and no-new-privileges. PostgreSQL TLS is observed through pg_stat_ssl; unrelated CA and certificate hostname failures make readiness fail, and unverified production TLS mode prevents startup. Database pause/unpause verifies readiness failure while health stays available, followed by successful profile/statistics reads. SIGTERM, restart and an exported runtime file inventory are also checked.

Only uniquely named test containers are removed. Logs, the exported runtime and evidence.json remain under the printed /var/tmp/setpiece-container-test-* directory; keys there are generated synthetic fixture material. The runner uses an existing Docker engine and does not stop it; the one-off verification separately started and stopped an isolated engine. These tests establish local read-only production-mode behavior, not writable/media staging acceptance.

For a future separate Railway service, select root /backend and configuration file /backend/railway.toml. The configuration requests one replica, /ready, a 60-second deployment health timeout and a 20-second drain. The server binds HOST=0.0.0.0 and respects PORT. Production requires DATABASE_URL with sslmode=verify-full, explicit HTTPS ALLOWED_ORIGINS and SUPABASE_URL, appropriate pool limits and matching PROFILE_TIME_ZONE. Database URI query parameters are restricted to one sslmode=verify-full and an optional nonempty sslrootcert; put the host, port, database and credentials in the URI authority/path. Duplicate options, malformed queries, fragments and connection/session overrides are rejected before opening a pool. Database CA files must be readable by the non-root user. Current production configuration still permits only the existing read-only functionality; do not set APP_ENV=development to bypass write/media guards remotely.

Railway's deployment healthcheck is not ongoing application monitoring. The current lifecycle advisory lease rejects concurrent owners: a rolling replacement can fail readiness while the old owner is still alive. One configured replica does not remove rollout overlap. Use a reviewed stop/start maintenance procedure after draining, or implement and test explicit ownership transfer before deploying writable room services. Migration 0004 and internal/ownership now fence room/vote writes using a transaction-held ownership row lock. Lease loss cancels the runtime and exits; local termination/stale-writer tests pass. Validate real session-pooler partitions and provider RPC overlap in staging; this is not a guarantee for already-issued LiveKit requests.

References: [Railway configuration](https://docs.railway.com/config-as-code/reference), [Railway healthchecks](https://docs.railway.com/deployments/healthchecks), [Railway deployments](https://docs.railway.com/deployments/reference), [Docker multi-stage builds](https://docs.docker.com/build/building/multi-stage/).

## Remaining acceptance and cutover sequence

1. Local container acceptance passed. Repeat the container runner for image-affecting changes and validate the selected image/configuration on the eventual staging service, including its actual network and database CA.
2. Use the authorized existing development project for signed-in acceptance; a separate staging project is not currently required. Audit legacy data, same-thread reply FK validation, privileges, RLS and old closure RPC/direct-write bypasses. Use [SECURITY.md](SECURITY.md) and the locally verified restricted-role candidate as evidence, not a production bootstrap. Review actual runtime/migration roles, inherited/default grants and provider/network fencing before lifting local guards.
3. Complete signed-in login/refresh/OAuth/reset/onboarding, profile/avatar, regular and featured two-speaker/audience audio debates, cancellation/skips, chat/votes/results/Elo, rankings, forum/MVP, notifications and admin/support. Include desktop/mobile microphone/autoplay and real Supabase Realtime delivery. See [MEDIA.md](MEDIA.md), [schema/ACCOUNTS.md](schema/ACCOUNTS.md) and [schema/COMMUNITY.md](schema/COMMUNITY.md).
4. Review a backup/restore with real schema ownership/grants and non-destructive migration compatibility. Record expected downtime, deployment settings and observation criteria; obtain production authorization against those concrete artifacts.
5. Disable new Node room creation, drain existing debates through final results/cleanup, verify no Node realtime writers remain, and reconcile durable results. Do not route active legacy room IDs to Go.
6. Switch new creation/listing/profile/community forwarding coherently: NEXT_PUBLIC_ROOM_BACKEND=go, NEXT_PUBLIC_PROFILE_BACKEND=go and NEXT_PUBLIC_COMMUNITY_BACKEND=go; GO_API_URL is the server-side Go origin, NEXT_PUBLIC_GO_HTTP_URL the browser HTTPS origin and NEXT_PUBLIC_GO_WS_URL its wss://.../api/realtime/ws endpoint. Rebuild the frontend. g2-prefixed URLs retain Go ownership independently of creation flags.
7. Observe structured errors, readiness, connection use, media permission failures and completion outcomes. Retain the old deployment for rollback. Retire server/, Socket.io and active Redis consumers only after parity and observation succeed.

Rollback for reads is disabling forwarding. After writable room cutover, first stop new Go rooms and drain or explicitly cancel under the approved recovery policy; then direct new rooms to Node. Node cannot reconstruct active Go state. Preserve additive migrations, votes, results and awards; do not replay finalization or undo committed data to restore traffic.

## Local permissions and ownership rehearsal

The integrated runner now creates a second empty database for ownership fencing tests and applies a fixture-only permission candidate to the main synthetic database. The application logs in as setpiece_app, not the database owner; only fixture setup, migration and fault injection use the temporary owner. The dedicated lease connection is terminated during the real HTTP/WebSocket composition test, and the test requires runtime exit and successful fresh-owner restart. The runner stops the whole temporary PostgreSQL cluster on completion.

Run the same `node scripts/rehearse.cjs --race` command. No secrets or extra application configuration are required. Existing local lifecycle databases need migration 0004 before starting the updated runtime. The security candidate remains outside automatic migrations because live revocation must be coordinated with legacy writers. See [SECURITY.md](SECURITY.md) for precise scope and remaining gates.

## Verification record

Verified locally on 2026-10-12 with Go 1.27.2 and PostgreSQL 16.1: the integrated composition test passed under the race detector; the explicit migration CLI rerun and synthetic dump/restore passed. Migration failure rolled back all pending schemas/ledger changes, checksum tampering was rejected, and the active runtime excluded both migrations and a second owner. Shutdown/restart preserved exactly-once results and MVP awards. The disposable rehearsal PostgreSQL cluster was stopped afterward.

Full backend race tests, account/community/legacy-profile SQL fixtures, go vet and go build passed. A CGO-disabled Linux amd64 binary cross-compiled successfully; its ELF headers have no dynamic interpreter. At that point the binary had not been executed on Linux and the image had not been built; the subsequent container verification below closes those local checks. Source credential-pattern, whitespace, ignored-secret and documentation-link checks passed. Both disposable PostgreSQL servers were stopped. The original checkout retains its eight changed files (183 additions/57 deletions).

On 2026-10-16, Docker 29.9.0/Buildx 0.38.0 in WSL built the actual Go 1.27.2 production image and the container acceptance runner passed. Application image: sha256:d99e83f0b42f8e855309756e4f2912c5469a9379b0ed6ca0c68cc36ba7afb2c4. PostgreSQL fixture image: sha256:275447c94b11b151decd1f29877965301d5a77032037c46de93d990f739f00a9. Verified non-root/read-only operation, PORT, actual profile/statistics reads, authentication/origin rejection, TLS positive/negative cases, health/readiness during outage, recovery, shutdown, restart and runtime file inventory. Initial SIGTERM duration: 0.497 seconds (15-second deadline). Fixture containers were removed and the private engine stopped.

Signed-in browser/provider checks and production acceptance remain open. No connected browser session or separate staging project was available. No frontend code changed in this phase, so phase 4C frontend validation was not repeated. No live schema/data mutations, deployment, commit or push occurred.

## Local hardening verification record

Verified on 2026-10-16: the guarded ownership SQL and restricted-role integrated rehearsals passed under the race detector, including lease termination, waiting-transaction takeover, stale-token rejection, permission denials, real composition recovery, migration rerun and synthetic backup/restore. Full backend race tests, go vet and go build passed. The updated Linux image sha256:d295ab6e444e40c7c39d04cfff1bba25d0a73288ac77b06ed17c972f75fe8d36 passed the container acceptance runner; graceful shutdown took 0.525 seconds. Container fixtures and the private Docker engine were cleaned up; the temporary Windows PostgreSQL cluster was stopped. Source credential-pattern, documentation-link and whitespace checks passed. No frontend code changed, so frontend tests were not repeated. No production data/schema/grant changes, deployment, commit or push occurred. The original checkout retains eight changed files (183 additions/57 deletions).

On 2026-10-17, database URI validation was tightened: production accepts only a single sslmode=verify-full and an optional nonempty sslrootcert; fixture targets reject duplicate, malformed and extra query options. Regression tests demonstrated the previous acceptance and now pass under the race detector. The rebuilt image sha256:c6ec9b16abc06206793ea08ea2fbc8c503d9bd8622f60a98aa49aa79e895fa9b passed the synthetic container runner, including explicit startup rejection for duplicate TLS, host override and malformed options. Valid TLS/readiness, outage recovery, restart, non-root/read-only operation and runtime inventory passed; shutdown took 0.513 seconds. Evidence is in /var/tmp/setpiece-container-test-i9vmevkb on the local WSL instance. Fixture containers and the isolated engine were stopped. This does not enable production writes or media.

The full Go race suite, go vet and go build also passed for this configuration change. No frontend code changed, so the previously passing frontend suite was not rerun.
