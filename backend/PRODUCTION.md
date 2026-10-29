# Existing-service Go cutover

## Authorization and current status

The user approved replacing the broken Node deployment with Go and switching the existing Vercel frontend on 2026-10-29. Do not recreate Upstash. Retain the existing Supabase PostgreSQL/Auth/Storage and LiveKit project. No application-data migration is needed for this code slice: migrations 0001-0004 and restricted runtime grants were already applied in the authorized development migration.

Read-only preflight on 2026-10-29 found all four migrations, zero nonclosed Go rooms, zero live/voting SQL debates, no advisory owner and zero LiveKit rooms. The runtime connects as setpiece_app; only the separate administrator connection can read the migration ledger. The private contact view exists. Railway reports the legacy /server deployment CRASHED. Hosting settings and variables are backed up privately outside Git under the user's LocalAppData/SetPiece/backups/cutover-20261029.

The user accepted free-plan development hosting after Railway rejected disabling sleep. Cold starts and sleep/restart interruptions remain possible; always-on production availability is not established. The recovery policy gives disconnected speakers 15 seconds to return, cancels unfinished debates without Elo if they do not, and preserves voting for transactional finalization.

Validation: full Go tests and vet, integrated synthetic PostgreSQL/WebSocket/ownership/drain/backup-restore rehearsal, and all 40 frontend tests passed. The Linux race checks passed all packages; realtime was rerun successfully after supplying its external event-contract fixture mounts. The final Linux image sha256:2d5ff6f5b40b37d355358c8259e9dde8176eda9a64ee715e816d2817c5c8230c passed non-root/read-only, TLS positive/negative, outage/recovery, restart and shutdown acceptance (0.166 seconds). The deployed migration checksums match the four source files, and setpiece_app has no superuser/BYPASSRLS/create-role/create-database privileges. Hosted deployment remains pending.

## Runtime configuration

Use APP_ENV=production, HOST=0.0.0.0, PORT=8080, DATABASE_MAX_CONNS=5, PROFILE_TIME_ZONE=America/Vancouver, SUPABASE_URL matching the existing project, and ALLOWED_ORIGINS=https://set-piece.vercel.app.

PRODUCTION_DATABASE_URL must use the restricted setpiece_app role, the explicit PRODUCTION_PROJECT_REF, database postgres, direct/session port 5432 and sslmode=verify-full. All other application/fixture database variables must be unset. Transaction pooling is incompatible with the session advisory lock. One shared pool serves all modules; one connection holds the lease. Loss of ownership fences writes and stops the process.

For a hosted environment, supply the public Supabase certificate through DATABASE_CA_PEM and remove the workstation-specific sslrootcert URI option. Alternatively mount a CA and use sslrootcert; never configure both. No credentials are copied into the image. LIVEKIT_URL is a public wss origin, with server-only LIVEKIT_API_KEY and LIVEKIT_API_SECRET. LOCAL_LIVEKIT_* must be unset.

Railway: existing service, root /backend, Dockerfile, config /backend/railway.toml, one replica, sleeping enabled because the free plan requires it, target port 8080, health /ready. Startup never applies DDL. Before starting, verify the existing migration ledger/checksums and required grants with read-only inspection. Future schema changes still require reviewed migrations and a verified backup using the controlled development-project tooling; fixture SQL is never a production bootstrap.

Vercel must rebuild with PROFILE_READ_BACKEND=go, NEXT_PUBLIC_PROFILE_BACKEND=go, NEXT_PUBLIC_COMMUNITY_BACKEND=go and NEXT_PUBLIC_ROOM_BACKEND=go. Set GO_API_URL and NEXT_PUBLIC_GO_HTTP_URL to https://setpiece-production.up.railway.app and NEXT_PUBLIC_GO_WS_URL to wss://setpiece-production.up.railway.app/api/realtime/ws. Keep Supabase session/Auth/Storage configuration. Go WebSockets are not Socket.io; changing only the old socket URL is insufficient.

## Maintenance and deployment order

1. With a verified Supabase bearer token for an administrator, POST /api/admin/runtime/drain with JSON {"draining":true}. The profile's server-side is_admin check is mandatory; anonymous and non-admin calls are rejected.
2. Creation and ready commands stop after already-admitted operations finish. Existing countdowns, chat, reconnects, timers, votes and finalization continue. GET /api/admin/runtime reports draining, activeDebates and safeToStop. Counts include countdown, live, voting, awaiting_result and results. Do not stop until safeToStop is true.
3. Drain is process-local and resets on restart. Concurrent administrative changes must be serialized by the operator; a database status-read failure returns 503 and must not be interpreted as safe to stop. The POST gate may already be engaged when that status read fails.
4. Stop the old Go owner before starting a replacement. A rolling candidate cannot acquire the advisory lock while the old owner runs; one replica/zero overlap does not by itself implement stop-before-start. Use explicit stop/start for later Go releases, accepting a maintenance interval. Do not weaken fencing to make rolling health checks pass.
5. Start the verified image, check /ready and origin/auth behavior, then switch frontend traffic. Resume creation with {"draining":false} when needed. This first Node-to-Go switch has no Go owner to drain; preflight found no active SQL debates or media rooms.

## Rollback and limits

Keep prior deployment IDs/settings and private backups. If Go fails before frontend cutover, leave frontend flags unchanged while repairing it. After cutover, drain Go before replacing the Go image; preserve database results and additive migrations. Node cannot resume Go-owned PostgreSQL rooms. The old Node service depends on deleted Redis, so merely restoring its image is not a functional rollback and is not authorized as a reason to recreate Upstash. Prefer a prior validated Go image or maintenance while repairing the fault.

Synthetic tests establish transaction/protocol/media behavior, not browser microphone/autoplay acceptance. The user previously confirmed Profile, Forum, name saves and avatar uploads with the local Go preview, but has only one account. Real multi-account browser audio/voting, notification delivery and remaining Auth flows remain open. Keep server/ and legacy dependencies until observation and acceptance justify removal.
