# SetPiece V2 migration plan

## Hosted Go cutover completed (2026-10-30)
The user approved finishing Go deployment on the existing Railway/Vercel projects without recreating deleted Upstash. This supersedes earlier deployment approval gates for this cutover. The overhaul is merged into master af41083; implementation continues on setpiece-go-production.

- [x] Add explicit production writable/media settings, restricted role/project/TLS guards and one shared pool.
- [x] Add authenticated administrator creation-stop/drain controls.
- [x] Read-only preflight: four migrations, zero active rooms/debates/owners, existing LiveKit responds with zero rooms.
- [x] Complete new regression, SQL, race and final container checks.
- [x] Configure/deploy the existing Railway service from /backend and verify health; free-plan sleeping explicitly accepted.
- [x] Switch and rebuild Vercel with all Go flags and matching HTTP/WebSocket endpoints.
- [x] Verify hosted public routes, CORS/preflight and anonymous protocol guards; user confirms signed-in room creation opens successfully. Multi-user media/voting acceptance remains open.
- [x] Publish runtime changes as 67d4b77 on master and record hosting evidence in backend/PRODUCTION.md.

See [backend/PRODUCTION.md](backend/PRODUCTION.md). Supabase remains the sole application database. Deleted Redis state cannot be recovered by the Go migration; no active SQL debates or LiveKit rooms were found.

Status: phases 1-4C and the hosted Go cutover are implemented. Railway and Vercel use Go; the user confirms hosted room creation. Remaining work is multi-user browser/media/notification/Auth acceptance, observation and eventual legacy-code retirement. Earlier phase descriptions below are historical.
Baseline: master/origin/master 8333e70e8d8d1e97c65c52b55a0d7be76cb67c35.
Audit date: 2026-10-10 (America/Vancouver).
Read [ARCHITECTURE.md](ARCHITECTURE.md) for evidence/contracts and [AGENTS.md](AGENTS.md) for persistent instructions.

## 1. Scope, approval and preservation

The initial task created AGENTS.md, ARCHITECTURE.md and MIGRATION_PLAN.md on setpiece-v2-overhaul. The user subsequently approved starting milestone 1 on 2026-10-10. The original debate-features checkout and its eight uncommitted files remain untouched. Early turn handoff and the unfinished room layout are excluded; add features later through separate requests.

The user approved phases 2A, 2B and 3A on 2026-10-10, explicitly selecting 15-second restart recovery and first-vote-final semantics. Room/voting writes remain isolated while phase 1's legacy workflow checks are open. The user approved phase 3B on 2026-10-11 and selected isolated local LiveKit testing. Phases 4A and 4B were subsequently approved, including canonical personal ranking and nested forum replies capped at depth 20. Phase 4C was approved on 2026-10-12. Phase 5 is approved for an integrated local rehearsal first. Production deployment/cutover and legacy retirement remain separate gates. Do not mark a milestone complete because scaffolding exists or unit tests pass while required integration evidence is missing.

Retain the root Next.js UI, Supabase PostgreSQL/Auth/Storage, LiveKit, Vercel frontend and Railway backend. Preserve existing features; do not blindly preserve correctness bugs. Document compatibility changes and unresolved product rules before coding the affected feature. Keep Node operational until parity and cutover gates pass.

## 2. Dependency order

~~~text
0A: source audit / these documents / explicit approval
  -> 0B: deployed schema, auth and deployment baseline
  -> 1: Go foundation + authenticated profile read
  -> 2A: room/debate lifecycle persistence and recovery
  -> 2B: transactional votes, finalization and Elo
  -> 3A: WebSocket/room/chat transport
  -> 3B: LiveKit integration + complete frontend room parity
  -> 4: remaining HTTP APIs/direct data calls + measured improvements
  -> 5: production cutover, legacy drain and retirement
~~~

Auth-independent scaffolding can start after approval while 0B evidence is gathered, but do not invent database details. Each schema-dependent slice requires its relevant schema/policy/function evidence first. LiveKit is an explicit dependency of room traffic cutover even though it is a separate implementation slice.

Do not let Node and Go write lifecycle/votes/results for the same active room. Initially validate Go in an isolated staging environment. Production migration can use a coordinated drain before switching all new rooms; a mixed cohort requires explicit per-room routing and ownership, not a random client feature flag.

## 3. Phase 0: baseline and decisions

### 0A. Repository audit (documentation deliverable)

- [x] Inventory frontend pages/components/hooks, backend routes, direct Supabase calls and runtime boundaries.
- [x] Identify 19 Next.js API files/24 operations, auth callback, four Express routes and realtime consumers.
- [x] Map 11 client commands and 29 server events at master, excluding uncommitted handoff.
- [x] Map Redis keys, voting/Elo writes, LiveKit permissions, forum/profile/admin flows and deployment files.
- [x] Record verified facts separately from deployed-schema/hosting assumptions.
- [x] Produce concise persistent guidance, architecture and this phased plan.
- [x] Obtain explicit approval before implementation (user: "great lets start with first milestone").

Affected files: the three root documentation files only. New Go packages: none. Acceptance: source links resolve, inventory matches master, and no application code changes enter this branch.

### 0B. External baseline before affected implementation

- [ ] Obtain a schema-only export/introspection covering types/enums, defaults, nullability, primary/foreign/unique/check constraints, indexes, views, grants, RLS, triggers and functions.
- [x] Inspect close_thread_if_expired and forum counter/notification triggers (4B); privileged Go services enforce the caller explicitly. Deployment privilege/search-path hardening remains a cutover gate.
- [ ] Verify Auth issuer/audience/signing algorithms/key rotation and token expiry; preserve existing OAuth/email/reset callbacks and redirect allowlists.
- [x] Inspect avatar bucket access policies (4A) and notifications Realtime publication (4B); live upload/delivery acceptance remains open.
- [ ] Verify Railway root/build context/replicas/environment/origins, Vercel project configuration and LiveKit provider/project settings.
- [x] Select and verify a Session pooler connection with pgx and verified TLS for the existing database. Transaction pooling is not used.
- [ ] Establish staging fixtures and a database backup/restore procedure before applying migrations.
- [ ] Capture representative HTTP responses and room event sequences, including anonymous/authenticated/admin cases.
- [ ] Record baseline build/lint results after installing from lockfiles in an appropriate test environment. The baseline had no checked-in automated tests; milestone 1 adds focused suites.

Affected files after approval: these docs, future setup documentation/environment examples and schema baseline under backend/migrations or a clearly separated schema reference directory. Do not execute a baseline export as a fresh migration against an existing database.

Risks: unknown triggers, RLS assumptions, missing constraints, ignored environment templates, and production configuration drift.

Acceptance: every affected query has a verified schema/authorization contract; fixtures contain no production secrets or unnecessary personal data; current production is unchanged.

### Decisions to settle before their dependent slice

- [x] Voting (phase 2B): the user approved first accepted vote is final. Identical retries succeed, including receipt retries after closure; conflicting sides return an explicit conflict. New votes require connected membership, spectator status and an open deadline.
- [x] Rankings (phase 4A): user approved personal rank matching leaderboard order, with stable user-ID ties. Phase 2B preserves K=32/denominator=400/JavaScript rounding and legacy elo_change, while the private result ledger records both speakers' before/after ratings and signed deltas (including unequal-rating draws). Existing profile/ranking contracts are unchanged.
- [x] Restart recovery (before 2A): the user approved 15 seconds for speakers to reconnect. Persist absolute deadlines; cancel unfinished countdown/speaking debates without Elo if either speaker fails to return. Preserve already-open voting for phase 2B finalization. Repeated restarts do not extend a recorded recovery deadline; reconnects retain the original phase deadline.
- [x] Chat (3A): retain bounded ephemeral history and existing limits. Document that process restart loses in-memory chat; retaining history through restart requires an explicit Redis or PostgreSQL decision.
- [ ] Authorization (before 3B/4): preserve authenticated featured-room creation unless an admin-only rule is explicitly adopted. Enforce media membership as a documented authorization correction.
- [x] Profile data (phase 1 read): preserve the legacy Auth/profile timestamp mismatch, query only the requesting Auth user's creation date, and return no email. Phase 4 identity writes remain separate.

## 4. Phase 1: Go foundation and one complete authenticated read

Approved first coding milestone; foundation, full profile read and forwarding implemented. Final legacy workflow acceptance remains open.

New files/packages: backend/go.mod, go.sum, cmd/server, internal/config, database, auth, users and a small HTTP transport/composition layer; test fixtures and non-secret environment example. Add only the packages this slice uses. Use shared ranking queries when needed rather than creating a second rating model.

Existing affected files: app/api/profile/me/route.ts (GET forwarding only), optionally a small shared server-side Go API client. Existing app/profile/page.tsx should consume the same response. Keep PATCH's legacy cache behavior, Auth callback, proxy and profile editing operational.

Dependencies: plan approval and verified profile/debate/auth schema for the read feature.

- [x] Add validated environment configuration, net/http routing, structured logging, request IDs, timeouts, body limits, error mapping and exact origin configuration.
- [x] Add pgx pool sizing, TLS configuration, context-aware query deadlines and database readiness.
- [x] Provide /health for liveness, /ready for database readiness and graceful bounded shutdown.
- [x] Validate Supabase JWT signature, issuer, audience, expiration, subject and configured algorithms; support bounded JWKS caching/rotation without logging tokens.
- [x] Implement complete GET /api/profile/me: profile fields, rank, totalDebaters, joinDate, username-change metadata and latest 20 finished debates with compatible formatting/null behavior.
- [x] Preserve existing user sessions using a temporary same-origin Next.js forwarding route. Forward the user's bearer token; Go revalidates it. Do not forward a service-role key as user identity.
- [x] Make route selection explicit and reversible, defaulting to legacy until validation. Do not automatically replay mutations on fallback.
- [x] Add focused configuration/auth/HTTP foundation tests and real PostgreSQL pool/read-only/cancellation tests.
- [x] Add complete profile response-contract and schema-backed repository integration tests.

Progress/evidence (2026-10-10):
- Implemented config, auth, database, HTTP and users packages, cmd/server, cmd/inspectdb, shared synthetic fixtures and Next.js forwarding. No schema migration or business mutation.
- Connected to the existing Supabase database through its Session pooler with sslmode=verify-full and the official CA. Direct IPv6 access is unavailable locally. Credentials and the schema export remain ignored.
- Inspected the deployed profiles/debates/votes metadata plus Auth columns; recorded the verified slice in backend/schema/PROFILE_READ.md. Both production read queries PREPARE successfully against Supabase. Forum/Auth triggers, remaining schema and deployment settings still require their phase 0B audits.
- go test ./..., go vet ./..., go build ./cmd/server and go test -race ./... passed with Go 1.27.2. Race tests used a portable 64-bit WinLibs compiler; SQL integration checks ran separately.
- Disposable PostgreSQL 16.1 tests verified profile response parity, nulls, wins/losses/draws, legacy ranking ties, caller isolation, missing profiles, latest-20 ordering, cancellation/recovery and read-only rejection (SQLSTATE 25006). Fixtures never ran against Supabase.
- Network shutdown tests verified request draining and forced closure at the deadline. Local /health and /ready return 200; unauthenticated Go and Next.js profile requests return 401.
- Six frontend profile tests verify the actual legacy route against the shared Go fixture, session ownership, bounded forwarding, sanitized failures and rollback. Four statistics tests cover Redis failure, successful live counts, empty profiles and database errors. Targeted ESLint, TypeScript and the Next.js production build passed.
- Local preview at localhost:3000 runs with process-only PROFILE_READ_BACKEND=go and GO_API_URL=http://127.0.0.1:3002. The user confirmed the signed-in profile loads. Stored frontend configuration retains the legacy default.
- The user-reported landing-page JSON error came from Redis DNS failure. The route now returns durable stats with debatingNow=null during Redis outages, and the UI handles unsuccessful/malformed responses. Live /api/stats returned 200 with valid JSON. The external Redis configuration still needs repair.
- Remaining acceptance: explicitly verify token refresh, profile editing/cache behavior and legacy rooms after Redis connectivity is restored. The local Node room server has not been started for this check. No production deployment, commit or push has been performed.

Risks: the current endpoint joins profile, Auth and ranking/history semantics; privileged SQL must not expose other users' private data. Date formatting/default values can change the existing UI even if raw database rows match.

Acceptance:
- [x] Missing/expired/wrong-issuer/wrong-audience/invalid-signature tokens fail; valid existing sessions succeed; key rotation is covered.
- [x] Authenticated identity controls whose profile is returned; missing profile gives the documented 404.
- [x] Responses match fixtures for empty histories, null fields, draw/win/loss rows and ranking ties.
- [x] Database failure produces bounded errors/readiness failure without leaking credentials.
- [ ] Auth login, refresh, profile edit and legacy rooms still operate.
- [x] Turning off forwarding restores the legacy GET without a database rollback.
- [x] Go tests/vet and relevant frontend checks pass; no new business mutation is introduced.

Stop scope: do not bundle WebSockets, votes, LiveKit migration, frontend relocation or new product features into this milestone.

## 5. Phase 2A: debate/room domain and durable lifecycle

New packages: internal/debates; repositories/migrations based on verified existing tables. Add room/lifecycle/participant fields or tables only where existing schema cannot express required state.

Existing behavior sources: server/src/rooms/{roomManager,sidePicker,featuredRoomManager}.ts, server/src/debate/{debateHandler,phaseEngine,timerService}.ts and server/src/state/roomStore.ts. Node remains authoritative for legacy rooms.

Dependencies: phase 1 code and verified relevant schema; recovery policy approved. The user authorized isolated phase 2A development while phase 1's remaining legacy browser checks stay open.

- [x] Separate durable room identity/topic/featured queue/speaker assignments/debate/deadlines/revision from ephemeral connection presence.
- [x] Port regular room creation/listing, side selection/readiness, six speaking phases, countdown, cancellation, results reset and cleanup.
- [x] Port featured topic shuffle/rotation, two skip votes, five completions, side-pick timing, inactivity and closing warnings.
- [x] Serialize per-room commands; prevent duplicate starts and conflicting side reservations. Use database constraints/conditional updates for durable invariants.
- [x] Persist real debate identity before announcing a committed start; handle failed creation without stranding a room in live state.
- [x] Add an injectable clock/scheduler and startup reconciliation of persisted deadlines. Use revision checks to ignore stale timers.
- [x] Define multi-tab/connection accounting separately from per-user membership and room capacity.
- [x] Expose shared services usable by HTTP and WebSocket; add proposed REST creation/read/state endpoints with reviewed contracts.

Risks: comments differ from executed behavior (regular side-pick timeout is not wired); room IDs are reused across successive debates; overlapping featured timers can advance a topic more than once.

Acceptance:
- [x] Concurrent ready/side/join requests preserve capacity, distinct speakers and one active debate.
- [x] Fake-clock tests cover all phase lengths, explicit leave, disconnect grace, cancellation/reset, featured skip/completion and closure.
- [x] Restart/stale-timer tests demonstrate the approved recovery policy without duplicate transitions.
- [x] Legacy rooms and database history remain untouched by staging Go runs.

Implementation/evidence (2026-10-10):
- Added internal/debates: pure lifecycle model, shared service, pgx repository and injected scheduler. Room state/deadlines/revisions are durable; connection IDs remain in memory. Multiple tabs count as one member; closing one tab does not remove the others.
- Added migrations/0001_room_lifecycle.sql for a private setpiece_runtime schema: rooms, normalized member slots/sides, and Go-owned debate links. PostgreSQL row locks, unique side/slot constraints, capacity checks and a partial unique active-debate index enforce concurrent invariants. The migration was applied only to fresh disposable PostgreSQL 16.1 databases.
- Refreshed live metadata read-only: setpiece_runtime does not exist, and no public room table exists. public.debates already supplies compatible status/timestamp/speaker fields. An additional chat_messages table exists but is not referenced by the audited application; phase 3A inspected its schema/policies read-only and retained ephemeral chat (see the realtime protocol).
- Opt-in POST /api/rooms, GET /api/rooms and GET /api/rooms/{roomId}/state call the service. Creation/state use verified caller identity, bounded request bodies, strict decoding and sanitized errors. These REST contracts are additive and do not replace the Socket.io event contract.
- LIFECYCLE_DATABASE_URL is accepted only in development for 127.0.0.1/setpiece_m2_* with sslmode=disable. It has a separate writable pool; DATABASE_URL remains the read-only profile pool. Startup takes a dedicated advisory lock, reconciles recovery before accepting traffic, and starts the bounded scheduler. No startup DDL.
- Phase timings and featured behavior are covered by deterministic clock tests. SQL concurrency tests race 20 joins, side reservations and repeated ready commands; only six members, one side owner and one debate are committed. A forced member constraint failure rolls back the debate insert and room update together.
- Recovery tests cover returning/missing speakers, repeated restarts, voting preservation, cancellation persistence, multi-tab membership, stale revisions, unchanged Elo and result-notification retries. Startup tests reject a second owner and verify lock release and automatic overdue cleanup.
- Go tests, vet, build and race checks passed, including the real PostgreSQL lifecycle suite under the race detector. HTTP tests cover auth, identity override rejection, malformed requests, pagination limits, restricted preflight and sanitized failures.
- Voting expiry enters awaiting_result. Only an already committed public.debates status=finished can release the results-display step; there is no lifecycle API that calculates or writes results/Elo. Phase 2B supplies that transaction.
- Existing Node room code, frontend room transport and live database contents remain unchanged. The lifecycle setting remains unset in local application configuration; the profile preview still runs the prior read-only binary.

Review [backend/schema/ROOM_LIFECYCLE.md](backend/schema/ROOM_LIFECYCLE.md) for precise recovery rules, deliberate legacy corrections, REST contracts, isolated setup and remaining production gates. These local acceptance checks do not establish browser/media parity or production readiness.

## 6. Phase 2B: PostgreSQL voting, finalization and Elo

New packages: internal/voting and leaderboard, shared transaction-aware repositories. Existing sources: server/src/state/voteStore.ts, server/src/voting/*, server/src/elo/eloCalculator.ts; inspect profiles/debates/votes constraints before additive migrations.

Dependencies: phase 2A, voting-policy decision, known database triggers and existing-data validation.

- [x] Verified existing UNIQUE(debate_id,user_id), side checks and foreign keys; reuse them without adding duplicate constraints or rewriting existing rows. No duplicate/orphan cleanup is required by this additive ledger migration.
- [x] Authenticate caller; check active membership/eligibility, speaker exclusion, side, status and server deadline inside the transaction.
- [x] Coordinate vote acceptance and closure using the same locked debate/state row; define the transaction's acceptance instant.
- [x] Apply the approved vote policy and idempotency semantics. Key votes by debate ID, not reusable room ID.
- [x] Derive totals from durable votes or update aggregates transactionally; never maintain unrelated counters as truth.
- [x] Finalize once: lock debate and profiles in a consistent order, calculate K=32 ratings, persist result, both profiles and finalization marker atomically.
- [x] Avoid double-writing counters already maintained by triggers. Store per-speaker rating history only through a reviewed additive change.
- [x] Publish committed counts/results; on failed delivery, snapshots recover truth. Add revision ordering so older totals cannot overwrite newer snapshots.
- [x] Expose a transport-neutral authenticated voting service and wire HTTP to it. The phase 3A WebSocket adapter now calls that same service.

Risks: lost profile updates across simultaneous debates, a vote racing closure, repeated finalization, conflicting retries, preexisting bad totals and unverified database side effects.

Acceptance:
- [x] Real PostgreSQL concurrency tests cover duplicate same-user requests, conflicting sides, multiple voters, expired windows and vote-versus-close.
- [x] One result and one rating update occur across concurrent/retried finalization.
- [x] Injected write failures roll back result and both profiles; no uncommitted event is sent.
- [x] Tests cover zero-vote draws, unequal-rating draws, wins/losses and shared speakers across debates.
- [x] Snapshot totals reconcile with persisted vote rows.
- [x] Historical data remains compatible; rollback disables Go writes without destructive schema reversal.

Implementation/evidence (2026-10-10):
- Added internal/voting and the pure internal/leaderboard Elo calculation. All votes are keyed by debate UUID and inserted directly into the existing public.votes contract; totals come from those durable rows.
- Vote acceptance locks the Go-owned room then debate, checks membership/disconnect status/speaker exclusion, and reads PostgreSQL clock_timestamp() after acquiring the locks. A transaction waiting past the deadline cannot use its earlier start time to admit a late vote.
- Identical receipts do not change votes or revisions; different-side retries return 409. Successful inserts increment room revision only in the committing transaction.
- Finalization uses the same room/debate lock, then locks both profiles in ID order with FOR NO KEY UPDATE (compatible with membership foreign-key checks). It commits counters, Elo, debate totals/result, the private result ledger, room results state and its deadline atomically. Retries return the recorded result.
- Added migrations/0002_debate_results.sql for the private unique-per-debate result ledger. It records both speakers' old/new Elo and signed changes. Existing public.debates.elo_change retains speaker A's absolute delta, and profile history behavior is preserved.
- Added authenticated POST/GET /api/debates/{debateId}/votes. GET restores aggregate totals, the caller's own vote, committed result and revision. No client finalization endpoint exists.
- The isolated lifecycle runtime now requires both migrations and starts the bounded finalizer worker alongside lifecycle scheduling. It resumes expired voting/awaiting_result records after restart. The existing local-only database guard remains enforced.
- Real PostgreSQL tests pass under the race detector: 20 identical concurrent votes, conflicting sides, multiple voters, 16 concurrent finalizers, early/late calls, speaker/nonmember/disconnected rejection, zero-vote unequal-rating draws, two debates sharing speakers and a vote blocked behind closure.
- A test-only trigger forces failure at ledger insertion after profile/debate updates; the transaction returns no successful state and all changes roll back. Retrying after removal succeeds. Snapshots reconcile with stored vote totals, and legacy/cancelled debates cannot be finalized.
- Backend unit/HTTP tests, full race checks, vet and build passed. Earlier profile/lifecycle SQL suites were rerun because their shared fixture/transaction helper changed. Tests used fresh disposable databases; no application database writes or schema changes occurred.

See [backend/schema/VOTING.md](backend/schema/VOTING.md) for acceptance timing, lock order, retry semantics, compatibility and isolated test commands. Phase 3A below adds committed-state delivery. Frontend/media parity remains phase 3B work; consumers must compare debate identity and revision.

## 7. Phase 3A: standard WebSocket transport, rooms and chat

New packages: internal/realtime and chat. Existing callers affected later: lib/socket.ts, hooks/useSocket.ts, hooks/useRoom.ts, types/socket.ts and the two room-creation modals. Preserve all contracts listed in ARCHITECTURE.md; there is no handoff command in this scope.

Dependencies: phases 2A/2B.

- [x] Use a maintained WebSocket implementation. Do not implement framing or emulate the Socket.io protocol.
- [x] Introduce a versioned contract document/test fixture for {type, requestId?, data}; initially retain baseline event names and payload fields.
- [x] Add bearer-authenticated short-lived single-use tickets for browser upgrades, expiry/replay protection and strict origin validation.
- [x] Add bounded read sizes, validation, rate limits, outgoing queues, write deadlines, heartbeats and stale-client cleanup.
- [x] Implement join/leave, direct replies, room broadcasts and error/acknowledgement correlation.
- [x] Keep socket transport separate from room commands/services. Count membership per user and live connections separately.
- [x] Preserve chat limits/history order and define JavaScript string-length compatibility for Unicode; deduplicate retries by request/message identity.
- [x] Implement complete authoritative snapshot recovery: room revision, server time, members/speakers/readiness, phase/countdown/voting deadlines, caller's vote, totals/results, featured queue position/count/deadline/skip state, closing state and chat.
- [x] Serialize snapshot and subsequent event delivery; handle revision gaps by resync.
- [x] Reconnect with backoff/jitter and fresh authentication; expire or reauthenticate long-lived sessions and disconnect on sign-out.
- [x] Audit old hook cleanup: temporary disconnect must not queue an explicit leave that cancels the rejoined debate.

Risks: slow consumers blocking rooms, stale optimistic UI, dropped events, multiple tabs removing each other's membership, and unbounded memory.

Acceptance:
- [x] All 11 baseline client commands and 29 server events have contract coverage.
- [x] Invalid JSON/types/oversized frames/origins/tickets fail safely.
- [x] Multi-client tests cover join/leave/reconnect, room switching, multi-tab presence, grace expiry and slow clients.
- [x] Refresh during countdown, live, voting, results and featured side-picking reconstructs the view from snapshots.
- [x] Go race tests pass in a supported environment; queues and histories remain bounded.
- [x] No production frontend switches yet; full media parity remains mandatory.

Implementation evidence (2026-10-10):

- Added maintained coder/websocket transport under the existing isolated lifecycle guard; live room ownership and media are unchanged.
- Implemented complete transactional read snapshots, serialized outgoing state, strict ticket/origin/expiry checks and bounded ephemeral chat. The adapter observes scheduler/HTTP/finalizer revisions with a bounded poll; transient intermediate events may coalesce, so snapshots are authoritative.
- Added the browser adapter with fresh ticket authentication, jitter, gap recovery and sign-out/disposal; phase 3B below subsequently wires it into explicitly routed rooms and fixes legacy buffered-leave cleanup.
- Real PostgreSQL/socket tests cover all 11 commands, multiple users/tabs, room switching, rejoin/grace expiry and countdown/live/voting/results/featured snapshots. Contract fixtures cover both baseline event maps and all 29 event families. Security/queue/chat tests and browser transport tests cover validation, expiry, bounded memory and retry behavior.
- The initial parallel whole-repository checks exhausted Windows memory; validation was rerun with bounded compiler concurrency. See the protocol for reproducible low-memory commands and the fresh database guard.
- Final verification passed: the full Go race suite, real PostgreSQL/WebSocket integration, vet/build, frontend TypeScript, targeted lint and four browser transport tests. The disposable database server was stopped afterward.
- No live schema or application-data writes; no frontend room switch, deployment, commit or push.

See [backend/REALTIME_PROTOCOL.md](backend/REALTIME_PROTOCOL.md) for the versioned contract, tests, memory limits and explicit assumptions (ephemeral chat idle eviction, coalesced notifications, bounded request receipts).

## 8. Phase 3B: LiveKit and frontend room parity

New package: internal/livekit using the maintained Go SDK. Existing sources/callers: server/src/livekit/*, server/src/debate/timerService.ts, hooks/useLiveKit.ts, components/room/*, app/rooms/*, components/landing/LiveDebatesGrid.tsx, app/api/stats/route.ts and lib/redis.ts.

Dependencies: phase 3A plus isolated local LiveKit (approved); deployed-provider/browser acceptance remains open.

- [ ] Preserve room-name/participant identity conventions and token response fields; verify token lifetime/rejoin behavior with the deployed provider.
- [x] Require authenticated room membership for media access; derive publication from authoritative speaker/phase state.
- [x] Reconcile publish/subscribe permissions on joins, phase changes, reconnects, cancellation and room closure. Retry failed permission changes; do not report success solely because an error was swallowed.
- [x] Preserve audience listening, active-speaker indication, manual mic controls and browser audio unlock in the implementation. Browser interaction acceptance below remains open. No camera/video feature is added.
- [x] Add explicit HTTP and WebSocket base configuration; do not leave LiveKit token calls tied accidentally to the old NEXT_PUBLIC_SOCKET_URL.
- [x] Adapt the transport hooks/modals and snapshot reducer while preserving the master UI, including its RoomTopBar and leave behavior.
- [x] Move room listing and live landing statistics to the chosen authoritative backend; replace Next.js Redis-key coupling.
- [x] Choose either a coordinated legacy-room drain or explicit per-room routing before any production cohort.

Risks: speaker permissions arriving after phase events, stale grants after reconnect, media identity conflicts across tabs, old tokens joining reused rooms and split backend ownership.

Acceptance:
- [ ] Two speakers plus audience complete a full audio debate, vote, view results and return to lobby.
- [x] Inactive speakers/audience cannot publish; token requests from nonmembers fail; reconnect restores current permissions.
- [ ] Featured skips/cancellation/five-debate closure work with media cleanup.
- [ ] Listings/statistics reflect the same runtime as room joins; refresh and room switching do not break audio.
- [ ] Browser checks cover desktop/mobile layouts and audio-unlock behavior.
- [ ] Node continues serving its existing rooms until drained; the frontend transport switch is reversible without assigning two owners to a room.

Implementation evidence (2026-10-11):
- Implemented scoped media tokens, membership/Auth-expiry checks, microphone-only permission reconciliation, revoke-before-grant ordering, provider-error retries and media cleanup for cancellation/reset/closure. Config is restricted to the disposable lifecycle database plus loopback LiveKit.
- Added explicit Go HTTP/WebSocket configuration, Go room hooks and snapshot projection, regular/featured creation, selected-runtime public listings/live counts, and g2-prefixed per-room routing. Node remains available for unprefixed rooms; no global room ownership switch was enabled.
- Preserved the existing UI and added connection/action/audio retry notices. Fixed offline buffered leave, legacy listener cleanup, disposed-effect reconnect and per-instance audio element cleanup.
- LiveKit 1.13.9 with three SDK participants passed real Opus RTP delivery from both speakers to the audience, all six phase permission changes, original-token rejoin, audience removal and room deletion. Unit tests verify nonmember/expired token rejection, no positive initial token grants, revision races, microphone-only grants and provider failures.
- Full backend race tests, disposable PostgreSQL/WebSocket/directory integration, go vet and go build passed. The combined media/HTTP suites also passed under the race detector; final UDP-only loopback audio verification passed. Both Go-enabled and default legacy Next.js production builds and TypeScript checks passed; the final build artifact retains legacy routing. Targeted frontend lint has no errors (one existing avatar-image warning).
- A combined disposable PostgreSQL + HTTP/WebSocket + real LiveKit test now passes two-speaker/audience audio, six permission changes, voting/receipts, results, lobby return and media deletion under the race detector. It uses synthetic fixture identities and a test verifier; actual Supabase/browser sessions remain a separate gate.
- All 23 frontend regression tests pass. They cover snapshot status/deadline translation, votes/results on refresh, bounded deduplicated chat, Strict Mode disposal/sign-out, routing/pagination, current-runtime live counts, and no fallback to unrelated legacy counts.
- Full browser acceptance is NOT claimed: browser automation failed to initialize with a Windows sandbox setup error. Desktop/mobile layout, actual microphone permission/autoplay interaction, and a signed-in end-to-end debate with voting/results still require a browser session. The combined SDK/SQL test does not replace browser microphone, autoplay or signed-in UI acceptance.
- The isolated PostgreSQL and LiveKit test processes were stopped after verification. The original checkout still has its same eight changed files (183 additions/57 deletions), and a private-credential scan passed.
- See [backend/MEDIA.md](backend/MEDIA.md) for reproducible local setup and the remaining acceptance checklist. No application database mutation, production deployment, commit or push occurred.

## 9. Phase 4: remaining APIs and selective improvements

Implement these as separate slices. New packages: users/leaderboard extensions, forum, notifications and admin/support. Dependencies: phase 1 for independent read APIs; phase 2B for ratings; verified functions/RLS for mutations.

### 4A. Profiles, rankings and statistics

Approved 2026-10-11; implemented and locally verified, with browser/cutover acceptance still open. User approved personal rank matching the corresponding leaderboard with stable user-ID ties. No production writes/cutover authorized.

Existing affected files: app/api/profile/*, app/api/leaderboard/*, app/api/stats, app/profile/*, app/rankings, app/register, app/auth/callback, components/profile/EditProfileModal.tsx, components/layout/TopNav.tsx, components/ContactModal.tsx and landing consumers.

- [x] Move profile application writes/username rules into an authenticated Go service; never trust caller-supplied Elo or admin fields.
- [x] Preserve avatar Storage access, Auth email/password flows, registration and canonical display-name behavior.
- [x] Migrate direct profile/admin lookups to reviewed Go contracts where appropriate; keep Supabase identity operations in the client/SSR integration.
- [x] Migrate ranked/unranked/global/regional/alltime/season queries, pagination, personal rank and history.
- [x] Resolve documented ranking/date-policy differences and avoid database response-limit truncation in seasonal aggregation.
- [x] Replace cache-only profile PATCH deliberately; invalidate/update cache only from committed canonical profile data.

Acceptance: fixtures cover filters/ties/pagination/nulls, profile ownership, protected fields, username uniqueness/cooldown, avatar access, onboarding, session refresh and unchanged UI contracts.

Implementation evidence (2026-10-11):
- Go account/ranking/statistics services and opt-in frontend forwarding/edit/onboarding integration are implemented. SQL schema metadata and avatar policies were re-inspected without application-data writes.
- SQL fixtures passed under the race detector: all filter combinations and pagination, 1,105 seasonal debates, canonical profile parity, concurrent unique names, cooldown/retries, injected rollback, ownership/protected fields, avatar URLs and onboarding defaults/retries.
- Full Go race suite, legacy profile SQL contract, vet and build passed. Frontend TypeScript and all 28 regression tests passed; targeted lint has no errors (three preexisting image warnings). Disposable PostgreSQL was stopped.
- Final review corrections are applied: helpers live under /api/account rather than the public username namespace; null regional ranks render a placeholder; personal rank requests include mode and discard stale responses. Go-enabled and legacy-default production builds passed, including TypeScript. Real signed-in browser acceptance remains open.
- Existing deployed profile RLS permits broad owner-row updates: Go allowlists alone do not remove direct Supabase bypasses. Production writes remain disabled until reviewed RLS/privilege hardening and remaining legacy consumers are addressed.
- See [backend/schema/ACCOUNTS.md](backend/schema/ACCOUNTS.md). No production profile, Auth, Storage or schema mutations, commit, push or deployment.


### 4B. Forum, notifications, support and administration

Approved; implementation and isolated verification completed 2026-10-12. User approved same-thread nested replies with a maximum depth of 20. Production writes remain disabled.

Existing affected files: app/api/forum/**, notifications/**, contact, admin/**; app/forum/**, app/admin/**, NotificationBell and ContactModal.

- [x] Port thread list/detail/create/delete/admin updates, replies, likes, reports and closure/MVP behavior.
- [x] Check parent-reply thread consistency and approved nesting policy; current comments do not prove enforcement.
- [x] Preserve thread/reply counts, upvote totals, notifications and MVP exactly once; retain verified database functions/triggers or replace them explicitly, never duplicate both.
- [x] Enforce author/admin/recipient authorization explicitly with privileged SQL; keep field allowlists.
- [x] Make like toggles/retries and concurrent mutations deliberate; enforce verified database uniqueness.
- [x] Port notification reads/mark-read and support/moderation APIs, including private contact data access.
- [x] Retain the Supabase notification subscription with user-switch/unmount cleanup and stale-response protection; SQL fixtures verify trigger-produced notification rows/updates.
- [ ] Verify actual Supabase Realtime delivery and signed-in forum/admin/support UI in staging. Local SQL tests cannot establish remote delivery.

Acceptance: authorization tests cover anonymous/member/owner/admin, cross-user notification access, content deletion, closed threads, likes/retries, report review, ticket review and realtime notification delivery.

Implementation evidence (2026-10-12):
- Read-only metadata inspection verified six community tables, constraints/indexes, RLS/grants, five triggers, four relevant functions and the notifications publication. Synthetic fixtures preserve the deployed trigger definitions.
- Added Go forum, notifications and support services behind NEXT_PUBLIC_COMMUNITY_BACKEND=go; default routes stay legacy. COMMUNITY_DATABASE_URL permits writes only in a guarded local development database, shared with account/profile reads.
- Likes use an explicit desired state, so concurrent identical retries cannot toggle twice. Retained database triggers exclusively maintain counters/upvotes and reply/like notifications. Deletion clears polymorphic likes before cascading content deletion.
- Added migration 0003 with a private closure ledger seeded from existing MVP markers and a NOT VALID composite parent/thread foreign key. Thread locks serialize closure and mutations; natural expiry awards at most one MVP across readers/reopens. Manual closure still awards none, and closed-thread likes remain allowed. No live migration applied.
- New replies have same-thread parents and depth <=20. New cross-thread links are rejected by SQL; deletion refuses malformed legacy cross-thread descendants until repaired. Reply pagination uses 30 rows with bounded tree merging; list pages use 20.
- Full Go race suite, account/community/legacy-profile SQL fixtures, vet/build passed. Final FK/cascade regression changes passed a further forum race/SQL run. Tests cover access control, parent depth, pagination, concurrent likes, counters, notification aggregation, delete cascades, exactly-once MVP, reopen and injected rollback, recipient privacy and admin review.
- All 34 frontend tests, TypeScript and both Go-enabled and legacy-default production builds passed. Targeted lint has no errors; three existing rankings image warnings remain. Disposable PostgreSQL was stopped.
- Remaining acceptance: real signed-in UI, Supabase notification delivery, coordinated application/lifecycle staging, privilege/RLS/RPC hardening, legacy-data audit and FK validation before production. The old closure RPC and direct Supabase writes must not bypass Go ownership.
- See [backend/schema/COMMUNITY.md](backend/schema/COMMUNITY.md) for configuration, behavior changes, tests, migration prerequisites and rollback. No production data/schema writes, commit, push or deployment.

### 4C. Redis and efficiency

Approved 2026-10-12. Measured improvements are implemented and locally verified. No production changes or legacy retirement.

- [x] Measure query latency/volume and memory before speculative caching. Compare old/new SQL on synthetic fixtures and retain existing bounded pagination; no new index was justified by this aggregate workload.
- [x] Preserve bounded per-user in-memory chat limits on one Go replica; verify cross-room limits, capacity recovery and idle eviction.
- [x] Evaluate leaderboard caching: defer it because no production load/hit-rate evidence justifies its consistency cost. There is no new cache to invalidate.
- [x] Remove the unused root profile-cache reader and unnecessary Go-statistics legacy client setup; test Redis isolation/outage behavior. Keep active legacy cache/statistics/room dependencies until all consumers migrate.
- [x] Keep votes/Elo in PostgreSQL; introduce no Redis Pub/Sub, shared presence or distributed rate-limit service.

Evidence:
- At 10,000 profiles/100,000 synthetic debates, seasonal list median fell 404.140 -> 257.172 ms (36.4%); personal rank 264.408 -> 202.080 ms (23.6%). Seven interleaved warm samples, one SQL query/request; all eight filter combinations and list/personal output compare equal. The smaller 1,000/10,000 fixture also improved. All-time SQL is unchanged.
- EXPLAIN ANALYZE/BUFFERS reports no temporary writes in these fixtures; shared block hits are approximately unchanged. Replace per-debate participant DISTINCT with a two-value expansion that preserves null/duplicate behavior. No index/migration or production EXPLAIN executed.
- Go statistics runs independent durable/live reads concurrently. Its fully migrated route creates zero legacy Supabase clients and loads no Redis. Mixed-mode routes still use the selected room backend; outage tests prevent cross-runtime fallback.
- The 128-room / 25,600-message chat fixture retained about 13.6 MiB for 280-byte ASCII bodies and released history after access beyond idle expiry. These are GC heap samples, not maximum process RSS or production capacity.
- Validation passed: full backend race suite, account/community/legacy-profile SQL fixtures, vet/build; all 38 frontend tests; TypeScript and production builds with both Go and legacy selections; targeted lint with no errors or warnings. The documented test:efficiency command passes. Temporary PostgreSQL was stopped; original checkout retains its same eight changed files. No production data/schema changes, deployment, commit or push.
- [backend/PERFORMANCE.md](backend/PERFORMANCE.md) records measurement method, bounds, reproducible commands, Redis dependency inventory and the deferred cache decision.

Acceptance: the measured query problem has a before/after comparison with equal results; Redis outage behavior is covered by controlled tests; no new cache requires invalidation. Real staging workload, legacy Redis connectivity and all browser/cutover gates remain open. Do not equate this local slice with production readiness.

## 10. Phase 5: deployment, drain and retirement

### 5A. Approved integrated local rehearsal

The user selected a local rehearsal before remote staging. All fixture data is synthetic; the retained production architecture still uses the existing single Supabase database.

- [x] Add development-only REHEARSAL_DATABASE_URL and one shared pgx pool across accounts, community and lifecycle; reject mixed database settings.
- [x] Add an explicit atomic, checksum-checked migration command with exclusion against the running lifecycle owner. No startup DDL or production migration support.
- [x] Prepare a non-root multi-stage Dockerfile, restricted build context, Railway single-replica settings and deployment/rollback runbook.
- [x] Verify real composition, ES256/JWKS authentication, cross-module HTTP/WebSocket flows, restart and migration failure/rerun behavior.
- [x] Verify synthetic PostgreSQL backup/restore.
- [x] Run full backend regression checks and cross-compile the Linux executable (static ELF inspected; not executed).
- [x] Build and run the Linux container against fresh synthetic PostgreSQL (5B local evidence below).

Evidence (2026-10-12): the integrated composition scenario passed under the race detector, including local ES256/JWKS verification, profile/forum/support HTTP flows, three real WebSockets, chat, voting, Elo/rank visibility and shutdown/restart without duplicate wins/MVP. Atomic migration rollback, checksum rejection, identical reruns and active-owner exclusion passed. The controlled CLI rerun and synthetic PostgreSQL dump/restore preserved the expected migration/result/award counts. Full Go race tests, account/community/legacy-profile SQL fixtures, vet/build and Linux amd64 cross-compilation passed; the ELF has no dynamic interpreter. Both disposable PostgreSQL servers were stopped. Source credential-pattern, whitespace and documentation-link checks passed. The original checkout retains eight changed files (183 additions/57 deletions). No live data/schema changes, deployment, commit or push.

See [backend/DEPLOYMENT.md](backend/DEPLOYMENT.md) for reproducible commands and remaining gates. The preparation slice does not complete phase 5.

### 5B. Local container validation (passed 2026-10-16)

The user confirmed there is no separate staging project and selected continued local preparation. An isolated Docker engine in WSL built and ran the actual production image; it was stopped afterward. No existing Supabase database or deployment was used.

- [x] Build the static Linux image with bounded build concurrency/memory; verify UID/GID 65532, disabled .env loading and minimal runtime files.
- [x] Run with a read-only filesystem, dropped capabilities, explicit PORT and production configuration against a fresh loopback PostgreSQL fixture.
- [x] Verify actual profile/statistics reads and PostgreSQL TLS; reject untrusted CA, mismatched certificate hostname and sslmode=require in production.
- [x] Verify anonymous authentication rejection, origin rejection, health/readiness separation during database outage, recovery, clean SIGTERM and restart.
- [x] Retain a reproducible synthetic-only runner and evidence; remove fixture containers and stop the isolated engine.

Evidence: backend/scripts/container-smoke.py passed using Docker 29.9.0, Go 1.27.2 and postgres:16. The tested application image is sha256:d99e83f0b42f8e855309756e4f2912c5469a9379b0ed6ca0c68cc36ba7afb2c4. The first measured graceful shutdown took 0.497 seconds against a 15-second forced-stop deadline. The runner exports and checks runtime files and records image IDs/results in its artifact directory. Build resource limits affect only compilation, not runtime limits.

Acceptance scope: Linux execution and existing production-mode read-only functionality are verified locally. This does not establish Railway deployment, writable/media production readiness, Supabase browser sessions, real provider behavior or network-partition fencing. No connected browser session was available for signed-in acceptance; staging remains unavailable. Full phase 5 stays open.

### 5B. Local ownership and permission hardening (2026-10-16)

The user approved this next local readiness slice. No separate staging project is available; production write/media guards remain unchanged.

- [x] Add migration 0004 with a private ownership token; require transaction-level token verification before room/vote writes.
- [x] Monitor the dedicated advisory-lock session, fail closed on loss, cancel work and exit without silent reacquisition.
- [x] Verify takeover waits for in-flight transactions and rejects a stale writer even before heartbeat detection.
- [x] Rehearse a restricted runtime role with explicit grants/RLS, without superuser/BYPASSRLS/DDL/Auth mutation/admin-field access.
- [x] Reproduce the protected-profile-field bypass, remove browser table/column mutations and legacy closure RPC access in a synthetic fixture, and verify rejection.
- [x] Run integrated profile/community/realtime/voting/ranking flows under the restricted role; terminate the live lease connection and verify fresh-owner recovery without duplicate wins.
- [x] Apply and verify reviewed grants/migrations against the actual authorized development project; actual roles/default grants and legacy write privileges are checked. Signed-in Storage/Realtime acceptance remains open.
- [ ] Verify actual network partitions, deployment overlap and outstanding LiveKit requests; PostgreSQL fencing does not retract provider RPCs.

Verified on 2026-10-16: the guarded ownership SQL and restricted-role integrated rehearsals passed under the race detector, including lease termination, waiting-transaction takeover, stale-token rejection, permission denials, real composition recovery, migration rerun and synthetic backup/restore. Full backend race tests, go vet and go build passed. The updated Linux image sha256:d295ab6e444e40c7c39d04cfff1bba25d0a73288ac77b06ed17c972f75fe8d36 passed the container acceptance runner; graceful shutdown took 0.525 seconds. Container fixtures and the private Docker engine were cleaned up; the temporary Windows PostgreSQL cluster was stopped. Source credential-pattern, documentation-link and whitespace checks passed. No frontend code changed, so frontend tests were not repeated. No production data/schema/grant changes, deployment, commit or push occurred. The original checkout retains eight changed files (183 additions/57 deletions).

The candidate permissions SQL is outside the automatic migration set and refuses non-fixture databases. The runtime always uses owned room/vote constructors; unfenced constructors remain only for standalone repository fixtures and read projections. See [backend/SECURITY.md](backend/SECURITY.md) for the threat boundaries, test commands and remaining acceptance.

### 5B. Existing development project (authorized 2026-10-17)

- [x] Confirm the current Supabase project is development-only and retain the single-database architecture.
- [x] Audit actual schema, roles, inherited/default/column grants and custom functions; check active debates, parent links and MVP duplication.
- [x] Save a private PostgreSQL 17 archive of public/auth/storage and restore it locally; compare all ten public table fingerprints.
- [x] Add explicit project/TLS/role configuration guards and a separately invoked migration command with a verified-backup gate.
- [x] Complete migration/permission checks on the restored copy, then apply reviewed migrations/permissions to the authorized project.
- [x] Verify existing data preservation and prepare a coherent Go-enabled local preview with isolated LiveKit.
- [x] User confirms signed-in Profile and Forum loading and page refresh without errors on the migrated development preview.
- [x] User confirms display-name saves and avatar uploads/refresh work.
- [ ] Complete remaining Auth flows, notification Realtime and multi-user room/media acceptance.

Verified on 2026-10-17: all four migrations and restricted permissions are applied to the existing development project; all ten public table fingerprints were unchanged afterward. The user confirms signed-in Profile/Forum loading and refresh. Full Go race/vet/build and updated Linux container checks passed.

Actual progress and configuration are recorded in [backend/DEVELOPMENT.md](backend/DEVELOPMENT.md). The next signed-in and media acceptance slice is authorized; individual results and reproducible steps are tracked in [backend/ACCEPTANCE.md](backend/ACCEPTANCE.md). Production deployment, real network/rollout validation and legacy retirement remain open.

### 5B. Browser/media acceptance continuation (2026-10-17)

- [x] Recover the local preview after a fail-closed ownership-loss shutdown; verify no active rooms/debates before recovery.
- [x] Correct the local media launcher to use the repository's loopback-only configuration; verify TCP 7880 and UDP 7882 bindings.
- [x] Inspect existing avatar Storage policies and notification publication/recipient policy read-only.
- [x] Reproduce and fix initial notification-request failure hiding the bell; preserve late-response/account-switch isolation and expose refresh.
- [x] Pass all 40 frontend tests, TypeScript, targeted lint and production build.
- [x] Pass real three-participant LiveKit RTP and combined PostgreSQL/HTTP/WebSocket/media lifecycle tests under the race detector; stop the disposable database.
- [x] User confirms display-name and avatar saving/refresh work.
- [ ] Complete one-account room/chat/rejoin checks; full browser audio/voting and cross-account notification checks await additional accounts. The user currently has one account available.

See [backend/ACCEPTANCE.md](backend/ACCEPTANCE.md). No browser surface was available for assistant control. Automated media clients are not evidence of browser microphone/autoplay acceptance. Existing Supabase data/schema/grants were not modified by this continuation; hosted deployment and retirement remain open.


### 5B. Database configuration hardening (2026-10-17)

- [x] Reproduce acceptance of duplicate TLS options, target/session overrides and malformed URI queries before the fix.
- [x] Restrict production database query options to one sslmode=verify-full and an optional nonempty sslrootcert; reject fragments and override parameters before opening the pool.
- [x] Apply strict query parsing consistently to local profile/community/lifecycle/rehearsal targets; retain existing development-project restrictions.
- [x] Pass the Go race suite, go vet, go build and the rebuilt Linux container's valid/invalid TLS and URI configuration checks.
- [x] Recover stopped Go/frontend preview processes after a read-only check found no active rooms or debates; verify Go readiness and frontend HTTP 200, and loopback-only LiveKit listeners.

The actual tested image is sha256:c6ec9b16abc06206793ea08ea2fbc8c503d9bd8622f60a98aa49aa79e895fa9b. Its synthetic container rehearsal also verified non-root/read-only operation, database outage recovery, restart, runtime file inventory and graceful shutdown in 0.513 seconds. Fixture containers and the isolated engine were stopped. No application data, schema or grants were changed. Browser/provider acceptance, production writable/media configuration, controlled hosted migrations and creation-stop/drain behavior remain open; production remains read-only. The recovered local preview retains its existing development binary; the revised production configuration is verified in the rebuilt container.

### 5B/5C. Hosted acceptance and production drain (pending)

New/affected files: backend/Dockerfile, backend/railway.toml, non-secret environment examples/setup docs, frontend routing/configuration, root dependency manifests and server/ retirement only after parity.

Dependencies: phases 1-4 acceptance, explicit deployment authorization when needed, known production settings and rollback drill.

- [x] Implement and locally verify the minimal non-root Go image, PORT handling, health/readiness and bounded shutdown; prepare single-replica Railway configuration.
- [ ] Verify those settings on the hosted service. Local container acceptance does not establish hosted operation.
- [ ] Implement and validate a reviewed production writable configuration, remote LiveKit settings and controlled deployment migration path after the remaining acceptance gates. Current production mode remains read-only.
- [ ] Implement and rehearse an explicit creation-stop/drain control before coordinated room cutover; a shutdown timeout alone is not a debate drain.
- [ ] Configure TLS database access, pool limits, correct production origins, secrets and separate HTTP/WebSocket/media URLs. Keep secrets out of NEXT_PUBLIC_* except deliberately public URLs/keys.
- [ ] Apply reviewed additive migrations through a controlled command, not speculative startup DDL; verify backups and existing-data compatibility.
- [ ] Exercise staging end-to-end: login/OAuth/reset/onboarding, profiles/avatar, normal/featured rooms, audio/chat/voting/results/Elo, rankings, forum/MVP/notifications and admin/support.
- [ ] Stop new legacy room creation, drain active Node debates through results/cleanup, then switch room listing, events and token/sync endpoints coherently.
- [ ] Verify no legacy realtime writers remain before assigning Go ownership; reconcile persisted debates/results.
- [ ] Monitor structured errors, health, permission failures, database connection use and completion outcomes.
- [ ] Keep the old deployment available for rollback during observation, without directing active Go rooms to it.
- [ ] Remove Socket.io client/server dependencies and legacy runtime only after the parity checklist and observation pass.
- [ ] Retain documented rollback artifacts and update this plan/architecture to distinguish implemented from proposed state.

Acceptance: existing sessions survive, no vote/result/Elo is duplicated or lost, new rooms use Go only, all retained features pass, and the Node service is demonstrably unnecessary. Supabase Auth/Storage/Realtime and LiveKit remain legitimate external services.

Rollback:
- Read-only HTTP slices: disable forwarding.
- Before room cutover: keep Go in staging and legacy production unchanged.
- After room cutover: stop creating new Go rooms, drain or explicitly cancel them under the approved policy, then route new rooms back. Node cannot reconstruct Go's PostgreSQL room runtime automatically.
- Preserve additive schema and committed results; do not reverse migrations destructively or replay finalization to restore traffic.

## 11. Validation and completion evidence

The initial documentation audit checked relative links/contracts and branch isolation. Milestone 1 evidence is recorded above. The original eight-file dirty checkout retains its 183 additions/57 deletions. In the overhaul worktree, the existing profile GET adds reversible forwarding and the user-reported landing statistics error is fixed. The legacy profile PATCH now caches committed canonical profile data; Go account writes are opt-in and local-only. Phase 3B now adds opt-in room/media frontend integration. No changes have been deployed, committed or pushed.

After implementation approval, record each milestone's commit, tests, fixtures/environment, unresolved limitations and rollback result. Use frontend lint/build/typechecks where affected, Go formatting/tests/vet, race checks for shared state, and real PostgreSQL transaction tests. Media and cookie-session parity require browser/staging validation beyond mocks. Load testing at large scale is deferred; bounded concurrency/slow-client correctness tests are part of initial reliability.

Next recommendation: continue the remaining signed-in/browser acceptance in backend/ACCEPTANCE.md. The existing-development migration and basic profile/avatar acceptance are complete. The user confirmed the existing Supabase project has no live users and approved preserving and migrating it; a second project is not required. Local room/vote fencing and restricted-role rehearsal now have evidence; provider/network/deployment behavior and legacy continuity remain open. Keep production write/media guards until those gates pass; cutover requires separate authorization.
