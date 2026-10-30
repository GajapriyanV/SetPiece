# SetPiece architecture

## Hosted Go architecture (2026-10-30)
The overhaul was merged into master (af41083). The user authorized the existing Railway/Vercel cutover after confirming the legacy Upstash database was deleted. The writable production configuration now shares one restricted Supabase pool across all modules and uses the existing remote LiveKit service. Administrator drain controls stop creation and ready commands while existing debates complete. Railway now runs Go from /backend, Vercel uses the Go profile/community/room switches, and the user confirms hosted room creation works. Supabase remains the single database/Auth/Storage provider and LiveKit supplies media; the active Go paths do not require Upstash. Current verification and hosted status are recorded in [the production runbook](backend/PRODUCTION.md); older sections below are historical milestone evidence.

Status: hosted Go cutover completed; multi-user browser/media/Realtime acceptance and legacy-code retirement remain open. The baseline inventory and earlier milestones below describe historical states.
Audit date: 2026-10-10 (America/Vancouver).
Baseline: master/origin/master commit 8333e70e8d8d1e97c65c52b55a0d7be76cb67c35.
Related documents: [instructions](AGENTS.md), [migration plan](MIGRATION_PLAN.md).

## Existing development project (2026-10-17)

The user confirmed the existing Supabase project is unused by live customers and approved its migration with existing data preserved. Supabase PostgreSQL/Auth/Storage remain in place; no second application database is being introduced. DEVELOPMENT_DATABASE_URL selects this explicit project through verified TLS and a restricted login, with one Go pool shared across modules and a loopback-only server. Fixture modes retain their local-database guards.

The actual managed Auth schema does not grant postgres the ability to delegate schema USAGE. The development role therefore reads a private owner-rights contact_identities view containing only id/email for canonical support-ticket identity; it receives no direct Auth schema access. Canonical profile queries already use public profile timestamps. See [the development runbook](backend/DEVELOPMENT.md) for backup evidence, actual application status and remaining browser checks.

## 1. Evidence and scope

The audit covers the tracked application layout, API handlers and callers, authentication, Socket.io contracts and handlers, room stores, timers, voting/Elo, LiveKit, forum/profile/admin flows, configuration, manifests, and deployment files. Public images, CSS, presentation components, and static club/country/topic data are frontend assets, not separate backend services.

The working branch is setpiece-v2-overhaul in a separate worktree created from origin/master. Eight uncommitted handoff/layout changes remain in the original debate-features checkout. They are not migration requirements. In particular, master has no debate:hand_off event or early-turn advancement feature; the earlier working-copy audit included that uncommitted feature.

The baseline inventory below is supported by source at the stated commit. Subsequent milestone evidence includes read-only inspection of the deployed profile/debate/vote schema and Auth column metadata, local integration tests, and the user's confirmation that the profile loads with Go forwarding enabled. Hosting configuration, the rest of the deployed schema and complete live-room workflows remain unverified.

## Approved implementation progress (2026-10-10)

[backend/README.md](backend/README.md) documents the implemented Go foundation and authenticated profile read: validated configuration, net/http, health/readiness, bounded graceful shutdown, structured logs/request IDs, ES256/RS256 JWT verification and cached JWKS, read-only pgx pooling, and separate users service/repository packages.

Next.js still validates the cookie session before forwarding the user's access token; Go independently verifies it and binds its subject to the SQL query. Set server-only PROFILE_READ_BACKEND=go and GO_API_URL to opt in. Unsetting the flag restores the complete legacy GET. PATCH, Auth callbacks and legacy room ownership remain unchanged. No business mutations or schema migrations were added.

Supabase PostgreSQL remains the single application database. The Session pooler connects successfully with verified TLS and the official Supabase CA; credentials and the certificate are ignored local files. The direct endpoint is unreachable from this machine's IPv4 network. The public JWKS exposes ES256. Read-only metadata inspection and PREPARE checks verified both production profile queries without exporting user records. [The schema contract](backend/schema/PROFILE_READ.md) records nullability, constraints, RLS, grants, triggers and legacy ranking/date semantics. This is not a complete database audit.

Go tests, vet, build and race checks passed (race checks used a portable 64-bit C compiler). Disposable PostgreSQL 16.1 tests cover real SQL, response fixtures, ranking ties, caller isolation, history limits, cancellation and read-only enforcement. Shutdown tests cover in-flight draining and the timeout. Next.js profile tests compare the actual legacy route with the same fixture, verify bearer forwarding and exercise rollback. Frontend typecheck, targeted lint and build passed. The user confirmed profile loading in the local Go-enabled preview; token refresh, profile editing and full legacy-room acceptance remain outstanding.

During that preview, the user reported an unrelated landing-page JSON error. The configured Upstash hostname fails DNS resolution. The statistics route now preserves database-backed statistics while returning debatingNow=null when Redis is unavailable; other failures return sanitized JSON. The landing component handles failed or malformed responses without an unhandled rejection. Regression tests and a local HTTP 200 check passed. Redis connectivity itself is still unresolved and may affect legacy rooms/profile caching.

## Approved lifecycle implementation (phase 2A)

The user approved the next step and the 15-second restart recovery policy on 2026-10-10. internal/debates now provides the durable room model, shared service, transactional PostgreSQL repository and bounded scheduler. The additive migration creates private setpiece_runtime tables without changing existing public tables. It has been exercised only in disposable local PostgreSQL databases. See [the lifecycle contract](backend/schema/ROOM_LIFECYCLE.md).

An optional LIFECYCLE_DATABASE_URL enables authenticated creation/state reads and public paginated room summaries on the Go server. It is rejected in production and must name a guarded local setpiece_m2_* database. The existing DATABASE_URL/profile pool stays read-only. The production UI and Node room runtime have not switched.

Room updates take a PostgreSQL row lock; normalized member slots/sides and a unique active-debate link enforce durable invariants. A real debate row is inserted atomically with the countdown before returning state. Clients/timers carry revisions; stale commands fail. Connection IDs are ephemeral and counted per user, while membership and disconnect/recovery deadlines persist. Already-open voting survives restart; phase 2B now supplies transactional finalization.

A refreshed metadata-only inspection found the private namespace absent and no public room table. It also found public.chat_messages, which is not used by the audited code. Phase 3A subsequently inspected its schema/policies read-only (see the realtime protocol); contents and external writers remain unknown. Redis is the observed active chat path.

Phase 2A added no result/Elo calculation; phase 2B below supplies it. Phase 3A below adds the local WebSocket adapter; Phase 3B adds opt-in media/frontend integration below; its browser acceptance remains pending. Local lifecycle tests do not replace the pending legacy workflow checks or later media parity gates.

## Approved voting implementation (phase 2B)

The user approved phase 2B and first-vote-final behavior on 2026-10-10. internal/voting now accepts authenticated spectator votes and finalizes Go-owned debates using PostgreSQL transactions. An existing unique constraint enforces one vote per debate/user. Membership, speaker exclusion, status and a database wall-clock deadline are checked after locking room/debate state. Identical retries return a receipt; changing sides is rejected.

Finalization locks both profiles in ID order, calculates the existing K=32 ratings through internal/leaderboard, and atomically writes both profiles, debate totals/result, a private finalization ledger, room revision and results deadline. The new ledger records exact per-speaker rating changes; legacy profile/ranking output remains unchanged. Concurrent/retried finalization cannot double-apply counters or Elo.

The isolated runtime exposes authenticated POST/GET /api/debates/{debateId}/votes and runs a bounded finalization worker. All write configuration remains development-only and restricted to guarded local databases. No live migration or application-data mutation has occurred. See [the voting contract](backend/schema/VOTING.md) for verified schema, transaction boundaries, SQL/race test evidence and remaining cutover gates.

## Approved realtime implementation (phase 3A)

The user approved phase 3A on 2026-10-10. internal/realtime now adapts coder/websocket to the existing room/voting services with single-use Origin-bound tickets, verified session expiry, bounded connections/frames/queues/receipts, heartbeat/write deadlines and reconnect snapshots. internal/chat owns bounded ephemeral history and cross-tab user limits. No SQL migration was added.

Room snapshots read membership, public profiles, votes and result ledger in one repeatable-read transaction. Serialized room delivery publishes committed changes; a bounded revision poll discovers scheduler and HTTP/finalizer updates. Polling may coalesce revisions, so baseline events are advisory and full snapshots are authoritative. The contract preserves all 11 commands and 29 baseline event names while adding version, correlation, sequence and revision fields. See [the protocol](backend/REALTIME_PROTOCOL.md) for limits and exact recovery semantics.

A standalone browser adapter obtains fresh tickets, reconnects with jitter, resynchronizes revision gaps and handles sign-out without buffering mutations. Existing pages still import the legacy Socket.io implementation. The legacy useRoom cleanup's buffered-leave risk is documented for replacement during phase 3B.

The Go transport remains gated by the same development-only lifecycle database configuration. Real local PostgreSQL/WebSocket and race tests exercise room commands, multitab presence, disconnect recovery and transactional voting/results; browser adapter tests use simulated network/authentication. These checks do not establish LiveKit parity or production capacity.

## 2. Current boundaries

~~~text
Browser / Next.js React UI
  |-- same-origin HTTP --> Next.js app/api routes --> Supabase Data API
  |                                             \-> Upstash Redis (stats/profile cache)
  |-- HTTP + Socket.io --> server/ Express process --> Upstash Redis
  |                                               \-> Supabase Data API (service role)
  |                                               \-> LiveKit server API
  |-- Supabase SDK ------> Auth / profile data / avatar Storage / Realtime notifications
  \-- LiveKit client ---> LiveKit media service (audio implemented)
~~~

- Root [package.json](package.json): Next.js 16.1.6, React 19.2.3, TypeScript, Tailwind, Supabase SSR/client, Socket.io client, LiveKit client, Upstash REST client.
- [server/package.json](server/package.json): separate Express/Socket.io process, jose token verification, Supabase service-role client, Upstash REST, LiveKit server SDK, Pino logging.
- [app/layout.tsx](app/layout.tsx) supplies shared navigation/fonts; [app/page.tsx](app/page.tsx) assembles landing components.
- Root app/, components/, hooks/, lib/, types/, utils/ remain in place. No frontend/ or Go backend exists at the baseline.
- Next.js routes mix transport and business/query logic. Node has domain-oriented directories, but services directly access Redis/Supabase and emit Socket.io events.

## 3. HTTP API inventory and consumers

There are 19 app/api route files with 24 exported HTTP operations. Paths below map to app/api/<path>/route.ts. Next.js uses the cookie-scoped Supabase SSR client; user-facing mutations generally require getUser(), with additional policy assumptions noted below.

- GET /api/stats: landing totals, most wins, daily debate counts and Redis room-member counts; HeroSection.
- GET /api/profile/me: current profile, rank, totals, formatted join date and latest 20 finished debates; app/profile.
- PATCH /api/profile/me: writes Redis profile cache only, not the profile row; EditProfileModal.
- GET /api/profile/[username]: public profile/rank/history; app/profile/[username].
- GET /api/leaderboard: pagination, ranked/unranked, global/regional, alltime/season; rankings and landing preview. Regional requires authentication.
- GET /api/leaderboard/me: authenticated user's position/statistics; rankings.
- GET, POST /api/forum: filtered/sorted thread list, top thread of last seven days, thread creation; forum and TopThreadOfWeek.
- GET, PATCH, DELETE /api/forum/[id]: thread/reply tree, admin featuring/closure, deletion; forum detail.
- POST /api/forum/[id]/reply: reply creation.
- POST /api/forum/[id]/like: thread-like toggle.
- DELETE /api/forum/reply/[id]: reply deletion.
- POST /api/forum/reply/[id]/like: reply-like toggle.
- POST /api/forum/report: content report.
- GET, PATCH /api/notifications: latest 20, unread count, mark all read; NotificationBell.
- PATCH /api/notifications/[id]: mark an owned notification read.
- POST /api/contact: authenticated support ticket; ContactModal.
- GET /api/admin/reports; PATCH /api/admin/reports/[id]: admin review list and mark reviewed.
- GET /api/admin/contact; PATCH /api/admin/contact/[id]: admin ticket list and mark reviewed.
- GET /auth/callback is separate from app/api: OAuth/code exchange, profile seeding, onboarding, password-reset and email-change redirects.

[server/src/index.ts](server/src/index.ts) exposes four Express GET routes:
- /health: process health and timestamp, without database readiness validation.
- /api/rooms: public room list read from Redis, with member counts and featured progress.
- /api/livekit/token?roomId=...: bearer-authenticated token issuance.
- /api/livekit/sync?roomId=...: bearer-authenticated permission resynchronization; despite GET, it can mutate LiveKit permissions.

Room listing callers are app/rooms/page.tsx (seven-second polling) and components/landing/LiveDebatesGrid.tsx. Room creation and all live debate mutations use Socket.io, not REST.

Direct browser access also matters:
- [app/register/page.tsx](app/register/page.tsx) upserts profiles and updates Auth onboarding metadata.
- [EditProfileModal](components/profile/EditProfileModal.tsx) checks usernames, updates profiles, uploads to the avatars Storage bucket, changes Auth email, then refreshes Redis through PATCH.
- Navigation, contact, forum and admin UI read profiles/is_admin directly.
- Sign-in/registration/reset components use Supabase Auth directly; configured UI providers include Google, Twitter and Discord, but deployed provider enablement is unknown.
- [NotificationBell](components/layout/NotificationBell.tsx) subscribes to INSERT/UPDATE on public.notifications filtered by user_id, then refetches HTTP data.

## 4. Authentication and authorization

[utils/supabase/server.ts](utils/supabase/server.ts) creates a cookie-scoped client; [proxy.ts](proxy.ts) refreshes sessions and guards /rooms and /profile with login and onboarding metadata checks. The callback handles code exchange and can seed a minimal profiles row. Preserve these session flows while migrating application APIs.

[verifyToken.ts](server/src/auth/verifyToken.ts) verifies tokens using the project's /auth/v1/.well-known/jwks.json and issuer, and requires sub. A comment says ES256; milestone 1 subsequently verified ES256 keys in the project's public JWKS. Audience and an explicit algorithm allowlist are not configured here. SUPABASE_JWT_SECRET is required by env.ts but unused by verification.

Socket authentication reads handshake.auth.token, resolves username/avatar from profiles with metadata/email fallbacks, and warms a one-day Redis cache. The client singleton in lib/socket.ts uses WebSocket with polling fallback, ten reconnect attempts, and a one-second initial delay. hooks/useSocket.ts retrieves a session token and retries connection errors with the available session.

Node uses a service-role Supabase client. Next.js forum deletions check login but omit explicit ownership predicates, relying on deployed authorization policy. Admin APIs check profiles.is_admin. Featured debate-room creation has no server admin check; featured forum-thread creation does. Do not conflate those features.

## 5. Realtime rooms and debate lifecycle

Sources: [registerHandlers](server/src/handlers/registerHandlers.ts), [roomManager](server/src/rooms/roomManager.ts), [sidePicker](server/src/rooms/sidePicker.ts), [featuredRoomManager](server/src/rooms/featuredRoomManager.ts), [phaseEngine](server/src/debate/phaseEngine.ts), [timerService](server/src/debate/timerService.ts).

- Room IDs are eight hex characters. Each socket tracks one room; Redis members are keyed by user ID.
- Regular rooms cap membership at 6; featured rooms at 50. Admission and side selection use separate reads/writes, not atomic reservations.
- Members select side a/b and ready up. Both ready initiates a five-second countdown and a Supabase debate insert. The initial event uses debateId "pending"; failed insertion logs an error without a complete state rollback.
- Speaking phases: opening_a 150s, opening_b 150s, rebuttal_a 60s, rebuttal_b 60s, closing_a 30s, closing_b 30s.
- Voting lasts 30s; results display lasts 60s. Regular rooms return to the same-topic lobby if occupied; empty rooms get a three-minute cleanup timer.
- A 60s regular side-pick timeout function exists but has no invocation in the registered flow. Do not mistake its constant for active behavior.
- Featured rooms accept 1-15 topics, shuffle them, and cycle until 5 completed debates. The 30s side-pick timer begins with at least two members. Timeout rotates topics; cancellation repeats the current topic.
- Featured skipping requires exactly 2 distinct votes, not a membership majority. Skips do not increment completion count. Closing warns for 30s. The 40-minute inactivity check closes only if no members remain; timer activation/reset behavior must be preserved or deliberately corrected.
- Live/voting debaters and lobby side-pickers have 15s disconnect grace; other users have 30s. Explicit speaker leave during live/voting cancels immediately. Reconnect within grace restores membership and broadcasts a notice.
- Phase, countdown, disconnect, cleanup and featured timers live in Node memory. No startup timer rehydration exists.
- Chat trims nonempty text, limits it to 280 JavaScript string units, and applies a process-local one-message-per-second user limit.

The frontend reducer in [hooks/useRoom.ts](hooks/useRoom.ts) consumes events, stores optimistic voting state and displays timestamps via useServerTimer. Snapshot recovery is incomplete: getFullRoomState returns votes: null and does not include current user's vote, vote deadline, final result, start countdown deadline, featured side-pick deadline or skip voters. Room status includes side_pick in types/UI, but selecting a side does not persist that status in the room store.

## 6. Socket.io event contract

Canonical source evidence: [frontend map](types/socket.ts), [server map](server/src/types/events.ts), handlers and hooks/useRoom.ts. There are 11 client commands and 29 server events at the baseline.

Client to server:
- room:create: {topic, sideALabel, sideBLabel}; room:create_featured: {topics: [{topic, sideALabel, sideBLabel}]}.
- room:join: {roomId}; room:leave and room:state: no payload.
- side:pick: {side: "a"|"b"}; side:unpick and side:ready: no payload.
- chat:send: {body}; vote:cast: {side}; featured:vote_skip: no payload.

Server to client:
- room:created: {roomId}; room:joined: {roomId, state}; room:state_sync: {state}.
- room:error: {code, message}; room:closed: {reason}; room:closing: {reason, closingAt}.
- room:member_joined: {userId, username, avatarUrl}; room:member_left: {userId}.
- side:updated: {sides: {a, b}, spectators}; side:ready_updated: {userId, isReady}.
- debate:starting: {debateId, countdown}; debate:phase_change: {phase, speaker, endsAt, index}; debate:ended: no payload.
- debate:cancelled: {reason, username}; debate:debater_disconnected and debate:debater_reconnected: {userId, username}.
- vote:window_open: {endsAt}; vote:window_closed: no payload; vote:count_update: {a, b, total}.
- results:final: {winnerId, result, votesA, votesB, eloChange, debaterA, debaterB}; each debater has {id, username, newElo}; result is side_a, side_b or draw.
- chat:message: {id, userId, username, body, createdAt}; topic:change: {topic, sideALabel, sideBLabel}.
- featured:topic_reveal: {topic, sideALabel, sideBLabel, topicIndex, debatesCompleted, sidePickEndsAt}.
- featured:topic_skipped: {reason}; featured:debate_complete: {debatesCompleted, maxDebates}.
- featured:side_pick_started: {sidePickEndsAt}; featured:debater_disconnected: {userId, username}.
- featured:debate_cancelled: {reason, username}; featured:skip_votes: {count, required, votedUserIds}.

UserBrief is {userId, username, avatarUrl}; FullRoomState includes room ID/status/topic/labels, members, debaters, phase, chat, debateId, votes, isFeatured and featuredMeta. Timestamps such as endsAt are epoch milliseconds; chat createdAt is an ISO string. Connect/disconnect/connect_error are Socket.io transport events and need explicit replacement behavior.

## 7. Persistence, voting, and rankings

[roomStore](server/src/state/roomStore.ts) uses Upstash REST:
- sp:rooms:active: active room set, without its own expiry.
- sp:room:<id>:state, members, phase, featured, skip_votes: room data with two-hour expiries set by selected write paths; not every update renews them.
- sp:room:<id>:chat: latest 200 messages, last 50 returned on sync, two-hour expiry.
- sp:room:<id>:votes and vote_counts: 30-minute expiry.
- sp:profile:<userId>: username/avatar cache, one-day expiry; shared with Next.js.

[voteHandler](server/src/voting/voteHandler.ts) permits voting only during voting status and rejects debaters. [voteStore](server/src/state/voteStore.ts) overwrites a user's vote and adjusts counters via multiple Redis calls. The UI disables voting after first selection; the server permits changes. This policy mismatch needs an explicit decision.

[voteTally](server/src/voting/voteTally.ts) reads Redis counts/votes, computes result, updates debates, updates each profile, inserts votes, then deletes Redis vote data. These are separate operations with largely unchecked Supabase error results. No transaction/idempotency boundary is evident in application code.

[eloCalculator](server/src/elo/eloCalculator.ts) uses K=32, expectation denominator 400, rounded ratings, and a 1200 profile fallback at tally. Stored elo_change is the absolute change of speaker A. Draws between unequal ratings can move Elo; profile history currently presents draws as zero movement.

Entities observed in the baseline source (profiles/debates/votes subsequently verified in backend/schema/PROFILE_READ.md; other entities still need deployed-schema inspection):
- profiles: identity/display/country/club/avatar, registration status, username-change timestamp, admin flag, Elo, wins/losses/draws/debate count, forum upvotes/MVP count.
- debates: room_code/topic/labels, speakers/winner, result/vote totals/Elo change, status and timestamps.
- votes: debate_id, user_id, side and identity/timestamps.
- forum_threads, forum_replies, forum_likes, forum_reports: content, authors, hierarchy, counters, likes, closure/MVP fields and moderation.
- notifications: recipient/actor/type/thread/reply/read/count fields.
- contact_tickets: sender/contact/content/review fields.
- Auth users and Storage avatars are external Supabase surfaces.

At the baseline, no tracked SQL migrations, DDL, database functions, generated database types, test suite or custom CI workflows were found. Milestone 1 adds synthetic test DDL and tests, not application migrations. The code invokes close_thread_if_expired; notification/counter/MVP generation is not implemented in inspected application code, so database triggers/functions are a hypothesis requiring verification.

Leaderboards support ranked/unranked, regional/global and alltime/season. Season 01 starts at 2026-01-01 UTC in lib/season.ts. Ranked seasonal views use current Elo, not a separate seasonal rating. Sorting differs among public profile rank, personal rank and seasonal lists. Season queries aggregate in application memory without explicit pagination over all database rows. Preserve contracts and record any correctness changes separately.

## 8. LiveKit and deployment

[LiveKit routes/service](server/src/livekit/livekitService.ts) use the application room ID as media room name and user ID as participant identity. Tokens last four hours, allow subscription, and allow publication only for the current speaker. Phase transitions change permissions; voting mutes both. Regular resets/cancellations and featured closure delete media rooms on their respective paths.

Token/sync routes verify a user and room existence, but do not verify membership. Permission-update errors are logged and swallowed. The [client hook](hooks/useLiveKit.ts) publishes microphone audio, attaches subscribed audio tracks, handles playback unlock, and calls sync after media reconnection. Camera/video is not implemented.

[Railway config](server/railway.toml) declares Dockerfile, /health and failure restart policy. [Dockerfile](server/Dockerfile) builds TypeScript using Node 20 and starts dist/index.js. Its paths expect server/ as build context; actual Railway root/replicas are unknown. Shutdown immediately exits after initiating socket/HTTP close.

Frontend Vercel hosting is the intended deployment, not verified from a checked-in Vercel project. The root README contains no substantive setup documentation. The baseline had no tracked environment example: the original checkout's server/.env.example is ignored by .env*. Milestone 1 adds an explicitly unignored backend/.env.example.

Frontend configuration references NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SOCKET_URL, NEXT_PUBLIC_LIVEKIT_URL and server-only Upstash REST credentials. Node requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, the unused SUPABASE_JWT_SECRET, both Upstash REST values and LIVEKIT_URL/API_KEY/API_SECRET; PORT defaults to 3001, CORS_ORIGIN to localhost:3000, and logging uses LOG_LEVEL/NODE_ENV. Do not copy secret values into documentation.

## 9. Corrections to the initial assumptions

1. Redis is the active room/vote store, not an optional cache today; Next.js also depends on its key format.
2. Only finalized votes reach PostgreSQL; transactional voting is new migration work.
3. Chat is ephemeral Redis history; durable chat would change retention and requires a decision.
4. Frontend sits at root and performs direct database/Storage operations; migrating API routes alone is insufficient.
5. Supabase Realtime notifications and avatar Storage are additional retained services.
6. Featured rooms, support tickets, notification/MVP behavior, regional/season rankings and onboarding must remain in scope.
7. Current media is audio, not an implemented audio/video feature set.
8. Supabase auth verification uses JWKS, despite a required legacy secret variable.
9. The baseline repository cannot establish deployed policies/constraints/triggers. Milestone 1 verifies the profile slice through read-only database inspection; the rest remains pending.
10. Timer recovery is not provided by Redis persistence; timers themselves are process-local.
11. Early turn handoff and room layout changes are uncommitted work on another branch and excluded.
12. Hosting settings, enabled auth providers and production health are not proven by configuration files.

## 10. Proposed Go modular monolith

Keep root Next.js and add backend/cmd/server, backend/internal, backend/migrations, go.mod/go.sum, Dockerfile and Railway configuration after approval. Start packages when needed rather than generating empty modules.

~~~text
Next.js UI / retained Auth callback and cookie refresh
  |-- REST ---------------------> Go HTTP handlers
  |-- standard WebSocket -------> Go realtime transport
  |                                |
  |                         shared business services
  |                          /       |          \
  |                    PostgreSQL  in-memory   LiveKit server API
  |                    durable     hub/presence
  |-- Supabase Auth/Storage/Realtime (retained during migration)
  \-- LiveKit audio media
~~~

Module ownership:
- config/database/auth: validated environment, pgx pool, query deadlines, JWT verification and permission checks.
- users: profile reads/writes and application onboarding; identity remains Supabase.
- debates: regular/featured room state machine, speaker eligibility, deadlines, cancellation and recovery.
- voting: one vote per user/debate, eligibility, closure synchronization and transactional finalization.
- leaderboard: pure Elo calculation and shared ranking queries; called by finalization inside its transaction.
- realtime: connection/authentication lifecycle, room subscriptions, bounded delivery, origin checks and heartbeats.
- chat: bounded history, validation and user rate limits.
- livekit: scoped tokens, participant permission reconciliation and media lifecycle.
- forum/notifications/admin: existing content, notification reads/updates, support and moderation.

HTTP and WebSocket transports call the same domain services. Services depend on narrow persistence/media/publisher interfaces; transport does not own voting or Elo. Finalization owns the database transaction across votes, result and profiles. Emit committed snapshots/events afterward; clients can recover when notification delivery fails.

PostgreSQL is authoritative for votes/results/ratings and recoverable room lifecycle/deadlines. Go memory holds active sockets, per-user presence, serialized room command processing and bounded ephemeral chat. Redis is optional for the new runtime, but retained for legacy consumers until replaced. Do not silently discard existing Redis-only state at cutover: drain legacy rooms.

Use net/http, pgx and a maintained WebSocket library; retain LiveKit's maintained Go SDK. One replica initially. Add explicit origin checks, read/write limits, health/readiness, structured logs and bounded shutdown. No custom WebSocket framing or media transport.

Proposed WebSocket envelope: {type, requestId?, data}; preserve baseline event names/payloads while adding request acknowledgements and room revision/deadline fields. Authenticate via a short-lived, single-use ticket obtained over bearer-authenticated HTTP; do not put access tokens in URLs. Reconnect reauthenticates and retrieves a complete snapshot with own vote, counts, deadlines, results, featured state and server time. Serialize snapshot/broadcast ordering; a revision gap causes resync. Bound queues and disconnect non-reading clients; track connections separately from user membership.

LiveKit must consult the same authoritative debate state and enforce room membership. Permission reconciliation is required before realtime cutover, not an optional later integration. Standard Supabase login/refresh can stay in Next.js; migrated same-origin routes may temporarily forward bearer credentials to Go without retaining business logic.

Privileged PostgreSQL access requires explicit authorization; existing RLS cannot be assumed to apply. Use a deliberate least-privilege role and verify any auth.uid()/request-claim dependencies in database functions. Inspect schema before adding constraints or choosing a connection/pooler mode.

Reference documentation checked during the audit:
- [Supabase signing keys](https://supabase.com/docs/guides/auth/signing-keys): JWKS and rotation.
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security): policies and bypass behavior.
- [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres): direct/session/transaction connection choices.
- [LiveKit grants](https://docs.livekit.io/frontends/reference/tokens-grants/): room-scoped tokens and permission changes.
- [coder/websocket](https://github.com/coder/websocket): maintained protocol implementation.

## 11. Explicit non-goals

Implementation authorization comes from the user's requests (currently phases 1–4C and phase 5 local rehearsal), not this design document. Do not add early turn handoff, camera/video, a UI redesign, microservices, Kafka, Kubernetes, gRPC, Terraform, a custom gateway, custom WebRTC, distributed tracing or a full metrics stack. Retain extensibility through module boundaries; introduce infrastructure only for an observed requirement.

## Approved media/frontend implementation (phase 3B, 2026-10-11)

The user approved phase 3B and selected isolated local LiveKit. internal/livekit uses maintained server-sdk-go/v2 v2.19.0; local verification uses LiveKit Server 1.13.9. The SDK raises the module minimum to Go 1.26.8 and brings its own transitive libraries; these do not introduce Redis, telemetry services or another production database into the Go runtime.

Authenticated GET /api/livekit/token and POST /api/livekit/sync read the same authoritative room store. Room names remain raw room IDs; participant identities remain Supabase user UUIDs, with profile names from PostgreSQL. New tokens last at most 60 seconds, capped by Auth expiry, and initially grant neither publishing nor subscription. Server-owned metadata binds the media session to Auth expiry and the room incarnation. Reconciliation removes departed/expired members, enables audience listening, and grants only the current speaker's microphone source. Publishing data, video and participant metadata updates remain disabled.

Permission revocation precedes the next speaker's grant. Realtime publication waits for successful media reconciliation; database commands still acknowledge their committed state if downstream notification fails. A four-worker sweep retries media synchronization every 500 ms, at most 128 provider rooms per sweep. Rooms without an active debate, closing rooms and closed rooms are deleted from LiveKit, including after restart. Unknown rooms are ignored. A provider-control outage cannot guarantee immediate remote revocation; no success is reported, retries continue, and browser permission-sync failures mute the local microphone. This limitation remains a deployment acceptance concern.

Browser URLs explicitly identify ownership: /rooms/g2-<id> uses Go and /rooms/<id> uses Node, independently of the flag selecting new room creation/listings. NEXT_PUBLIC_ROOM_BACKEND=go is opt-in; NEXT_PUBLIC_GO_HTTP_URL and NEXT_PUBLIC_GO_WS_URL specify transport locations. Switching the creation flag does not reassign existing rooms. Local media configuration accepts only ws://127.0.0.1 with the isolated development lifecycle database. No production media credentials or live room ownership were changed.

The Go room hook replaces view state from committed snapshots, restores own vote/results/deadlines, handles clock offset and reconnect, and binds sign-out and route cleanup. The retained media UI supports active speakers, manual microphone controls, browser audio unlock and explicit retry. One LiveKit identity per user means the newest tab takes over that user's media session; WebSocket membership still counts separate tabs. The older tab requires a deliberate audio retry rather than continuously displacing the newer tab.

Public room pages/counts query PostgreSQL through bounded projections; Next.js loads Redis only for legacy live counts. Durable landing statistics use Go SQL when profile/community forwarding is enabled; the legacy default retains its Supabase reads. See [backend/MEDIA.md](backend/MEDIA.md) for local configuration, tests and remaining browser acceptance.

## Phase 4A implementation update (2026-10-11)

Approved profiles/rankings/statistics slice is implemented and locally verified. Go users.Account and leaderboard.Repository add authenticated profile form/onboarding writes, scoped self lookup, canonical public/private profile reads, shared SQL list/personal rank and durable statistics. Next.js forwarding plus client use the disabled-by-default NEXT_PUBLIC_PROFILE_BACKEND switch. DATABASE_URL remains read-only; PROFILE_DATABASE_URL enables writes only against guarded local fixtures and selects the same database for account reads.

Metadata inspection confirmed no custom Auth/profile triggers, canonical write fields/defaults, case-sensitive username uniqueness and per-user avatar-folder policies. Profile RLS currently permits broad owner-row writes; harden that direct Supabase API path before production. The user approved ranking consistency and an ID tie-breaker. Public/private canonical profile join dates now use profile creation time; the old phase-1 read-only contract remains separate.

See [backend/schema/ACCOUNTS.md](backend/schema/ACCOUNTS.md) for contracts, date policy, validation evidence and outstanding UI/cutover gates. Phase 3B's signed-in audio/browser acceptance remains open.

## Phase 4B implementation update (verified 2026-10-12)

The Go modular monolith now includes application transaction helpers and forum, notifications and support modules, with explicit author/admin/recipient authorization. The 14 existing community Next.js route files forward to Go only when NEXT_PUBLIC_COMMUNITY_BACKEND=go; this flag also selects canonical Go profile reads for the UI. Public forum reads allow anonymous access, while supplied tokens are validated. No mutation falls back to legacy after a Go error.

COMMUNITY_DATABASE_URL enables writes only to a development loopback setpiece_m4_* database. It shares the profile/account store; conflicting PROFILE_DATABASE_URL settings are rejected. The existing Supabase DATABASE_URL remains read-only, including forum detail GETs. This local split is test isolation, not a proposed second production database. Phase 5 adds a unified local rehearsal; remote staging remains a cutover prerequisite.

Deployed reply/like triggers retain ownership of counters, received upvotes and reply/like notifications. Go locks the parent thread before mutations, accepts desired-state likes, removes polymorphic likes before deletion and finalizes natural expiry transactionally through a private closure ledger. The old close_thread_if_expired RPC is unsafe under concurrency/reopening and is not called by Go. Manual close behavior and closed-thread likes are preserved. Nested replies are capped at the approved depth 20, with same-thread parent validation and a composite SQL constraint for new writes; malformed historical relationships require audit before validation/cutover.

Reply reads paginate at 30 rows and the client merges a bounded, deduplicated tree. Supabase notification subscriptions remain; cleanup and request generations prevent stale or cross-user UI responses. SQL fixture evidence proves trigger writes, not remote Realtime delivery. Existing direct Supabase privileges and legacy closure RPC access must be hardened before enabling production Go writes.

See [backend/schema/COMMUNITY.md](backend/schema/COMMUNITY.md) for verified schema, contracts, rollback and remaining browser/staging gates. Backend race/SQL checks, 34 frontend tests, TypeScript and Go/legacy frontend builds pass; no live schema/data changes or deployment occurred.

## Phase 4C efficiency update (2026-10-12)

The measured seasonal ranking path now expands participant rows without a per-debate DISTINCT step, retaining identical ranking semantics. On a synthetic local 10,000-profile / 100,000-debate dataset, seasonal list/personal median query times decreased from 404/264 ms to 257/202 ms. These are warm single-client fixture measurements, not production latency or capacity.

Go-selected durable/live statistics reads run concurrently and avoid an unused legacy Supabase client. The unused root getCachedUserProfile helper was removed; active Redis writers/readers, legacy credentials and dependencies stay in place until drain/cutover. No leaderboard cache, index, Redis Pub/Sub or distributed limiter was added. PostgreSQL remains authoritative for votes/Elo.

Chat retains bounded in-memory rate limits/history. New tests exercise cross-room user limits and capacity recovery; a 25,600-message ASCII fixture retained about 13.6 MiB and released its history on access after idle expiry. Full transport/runtime memory still needs representative staging load measurements.

See [backend/PERFORMANCE.md](backend/PERFORMANCE.md) for reproducible measurements, cache ownership, remaining Redis consumers and retirement prerequisites.

Phase 4C validation passed: full backend race suite and account/community/legacy-profile SQL fixtures, vet/build, all 38 frontend tests, targeted lint and Go/legacy production builds including TypeScript. No production changes, deployment, commit or push occurred.

## Phase 5 local composition and deployment preparation

REHEARSAL_DATABASE_URL selects one shared pgx pool for all application and room modules, including the dedicated lifecycle lease connection. It requires development mode, 127.0.0.1, a setpiece_m5_* database, exactly sslmode=disable, at least two pool connections and no other configured database URI. These local fixtures do not introduce another production database. Existing production write guards remain in place.

The explicit cmd/migrate command embeds migrations 0001–0004 and records LF-normalized SHA-256 checksums in a private setpiece_migrations.applied ledger. All pending migrations and ledger changes commit atomically; changed recorded SQL is rejected. Its transaction advisory lock conflicts with the runtime ownership lease. Startup performs schema checks but no DDL. Existing manually migrated databases need a reviewed adoption procedure; fixtures are not a production schema bootstrap.

The production image definition contains a static Go binary and CA bundle, runs as a numeric non-root user and reads environment configuration without loading a .env file. Railway configuration requests one replica, /ready and a 20-second drain. The actual image passed Linux container acceptance in an isolated WSL Docker engine on 2026-10-16: non-root/read-only runtime, verified PostgreSQL TLS, profile/statistics reads, health/readiness, outage recovery, bounded SIGTERM and restart. The build uses GOMAXPROCS=2, GOMEMLIMIT=512MiB and go build -p 2 to bound compilation resource use; these are not runtime limits. Production remains limited to existing read-only functionality until write/media guards, privileges and all acceptance gates are addressed.

The current session-level ownership lease rejects overlapping runtimes. A future deployment must stop the old owner before starting its replacement, or introduce and test a reviewed ownership-transfer design. numReplicas=1 alone does not prevent rollout overlap. Migration 0004 now supplies a private ownership token: room/vote write transactions lock and verify it before domain locks; a replacement waits for those transactions before changing ownership. A monitored lease failure cancels the runtime and exits. Local tests cover lost sessions and stale writers; provider RPC fencing and actual network-partition/deployment behavior remain staging gates. See [backend/DEPLOYMENT.md](backend/DEPLOYMENT.md) and [backend/SECURITY.md](backend/SECURITY.md).

Phase 5 local evidence (2026-10-12): the real composition root passed ES256/JWKS, HTTP/WebSocket cross-module, scheduler/voting/Elo/rank and shutdown/restart checks under the race detector. Controlled migration rollback/checksums/lease exclusion, CLI reruns and synthetic backup/restore passed. Full backend race/SQL tests, vet/build and static Linux amd64 cross-compilation passed. Linux/container execution was subsequently verified with synthetic PostgreSQL on 2026-10-16. Signed-in provider/browser acceptance remains open; no production configuration or data changed.
