# Local media and frontend integration (phase 3B)

Approved on 2026-10-11 with an isolated local LiveKit server. This is local acceptance, not deployment. The real application remains on its existing Supabase database; disposable fixture databases are test data only.

## Run in isolation

Use Go >=1.26.8. Start LiveKit Server 1.13.9 (the verified local version) with:

~~~sh
livekit-server --config livekit.local.yaml
~~~

Its public development defaults are API key devkey and secret secret. Never use development mode on a public interface. Run from backend/. The checked-in configuration restricts signaling/API (7880) and media UDP (7882) to loopback, and disables media TCP. A plain --bind flag only restricts signaling, so use the file for isolated tests. The IP-filter and loopback options follow [LiveKit\'s configuration reference](https://github.com/livekit/livekit/blob/v1.13.9/config-sample.yaml).

The Go process accepts these variables alongside APP_ENV=development and an enabled lifecycle database: either a guarded local fixture mode or the explicitly authorized existing-project DEVELOPMENT_DATABASE_URL mode in [DEVELOPMENT.md](DEVELOPMENT.md). The LiveKit server itself must remain loopback-only:

~~~dotenv
LOCAL_LIVEKIT_URL=ws://127.0.0.1:7880
LOCAL_LIVEKIT_API_KEY=devkey
LOCAL_LIVEKIT_API_SECRET=secret
~~~

The fixture database must contain the verified profile/debate/vote baseline and migrations 0001/0002/0004 for runtime startup. Automated SQL tests create those only in a fresh setpiece_m2_test_* database. Browser testing additionally requires fixture profile/auth-user rows matching each test user's verified Supabase UUID; a local fixture does not change Supabase login or grant arbitrary browser identities. Do not point LIFECYCLE_DATABASE_URL at the application database.

For an isolated Next.js preview, set process variables before starting/rebuilding:

~~~dotenv
NEXT_PUBLIC_ROOM_BACKEND=go
NEXT_PUBLIC_GO_HTTP_URL=http://127.0.0.1:3002
NEXT_PUBLIC_GO_WS_URL=ws://127.0.0.1:3002/api/realtime/ws
GO_API_URL=http://127.0.0.1:3002
~~~

Allow the exact preview Origin in Go ALLOWED_ORIGINS. The Go token response supplies the media URL; NEXT_PUBLIC_LIVEKIT_URL remains a legacy setting. The current authorized development preview selects Go for rooms, profiles and community. Only configured Go processes expose media endpoints.

New Go rooms use /rooms/g2-<8 hex characters>; unprefixed URLs continue using Node. Keep Go running to drain its rooms when switching new creation/listings back to legacy. A creation-flag rollback must never transfer existing room ownership. Listings/live counts reflect the selected cohort, not a sum across unrelated runtimes.

## Permissions and recovery

- GET /api/livekit/token requires bearer authentication plus connected room membership. Creator status alone is insufficient. Returned fields are token, url, canPublish=false, expiresIn.
- The initial JWT lasts at most 60 seconds and has no publish, subscribe, data or metadata-update grants. Server metadata carries the original Auth expiry and room creation time.
- POST /api/livekit/sync reconciles the room and returns current canPublish/revision only after successful provider RPCs. Authenticated nonmembers fail; missing/unavailable media returns a retryable error.
- All valid members can listen. Only the current live speaker can publish, and only a microphone track. Recovery, elapsed deadlines and voting revoke publishing. New phase snapshots wait for media synchronization.
- The bounded background sweep reconciles reconnects and retries failures; original tokens cannot restore an old initial positive grant. LiveKit may refresh its own reconnect credentials during a session, so current server reconciliation remains necessary.
- Cancellation, featured reset/skip without an active debate, closing and closed state delete the media room. Restart does not depend on an in-memory previous-debate cache.
- The newest tab with a given user identity replaces the older media connection. Other tabs remain room members but do not auto-rejoin media in a loop.
- A control-plane outage can delay remote revocation. Go reports failure, retries and withholds phase publication; the browser mutes on failed synchronization. This is not an atomic transaction across PostgreSQL and LiveKit.
- The browser starts muted, checks permissions after connecting/reconnecting, catches mic/autoplay errors and exposes retry. Sign-out/unmount disconnects and detaches only that hook's audio tracks.

## Automated verification

~~~sh
# backend directory; dev server must already be running
SETPIECE_LIVEKIT_TEST_URL=ws://127.0.0.1:7880 go test ./internal/livekit -count=1
# Windows PowerShell: set $env:SETPIECE_LIVEKIT_TEST_URL instead.

# Separate disposable PostgreSQL fixture suite
SETPIECE_REALTIME_TEST_DATABASE_URL=<fresh guarded loopback URI> go test -race ./internal/realtime -count=1

# repository root
npm run test:room-state
npm run test:realtime
npm run test:stats
~~~

The LiveKit fixture refuses non-loopback targets and uses only public dev credentials. It creates a unique test room, connects two speakers plus audience, verifies actual Opus RTP delivery, all six permission changes, old-token rejoin, removal and deletion, then cleans up. SDK media tests are not browser microphone/autoplay tests. With both SETPIECE_REALTIME_TEST_DATABASE_URL and SETPIECE_LIVEKIT_TEST_URL set, the PostgreSQL suite also runs the combined HTTP/WebSocket/media debate through real audio, all six phases, voting, results and lobby cleanup. It uses synthetic identities and a test verifier; Supabase browser sign-in is not bypassed in application code. Frontend coverage includes Strict Mode disposal and sign-out.

## Remaining browser/provider acceptance

- [ ] Three signed-in fixture users complete regular audio debate, vote, view results and return to lobby.
- [ ] Refresh/reconnect and room switching preserve current permissions and clean up tracks.
- [ ] Featured skip, speaker cancellation and five-debate closure clean up media in the browser.
- [ ] Desktop and mobile layouts, actual microphone permission, active-speaker indication and autoplay unlock work.
- [ ] Verify the staging/deployed provider's token/reconnect behavior before any production cohort.
- [ ] Confirm legacy room continuity with working legacy Redis.

Browser automation could not initialize in this environment (Windows sandbox setup failure). These checks remain open; local SDK/SQL/unit evidence is recorded in MIGRATION_PLAN.md. No production settings or application database records were changed.

The 2026-10-17 acceptance continuation and reproducible media runner are documented in [ACCEPTANCE.md](ACCEPTANCE.md). Earlier statements above describe the original phase 3B fixture-only verification.
