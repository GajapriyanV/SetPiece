# Phase 4C: Redis dependencies and measured efficiency

Approved and measured on 2026-10-12. This slice uses synthetic local data; it does not read production user rows, alter production indexes/schema, retire the legacy server or establish production capacity.

## Changes and decisions

Seasonal rankings now expand the two debate participants with VALUES and an explicit duplicate-side check. The old per-debate DISTINCT/unnest step is removed. Null participants, duplicate participants, draws, invalid winners, date cutoffs and all list/personal ordering rules remain unchanged. Both implementations were compared across ranked/unranked, global/regional, all-time/season and list/personal reads.

Go-enabled landing statistics starts durable and live reads concurrently and does not create an unused legacy Supabase client. The two requests still consult their separately selected runtime; there is no cross-runtime fallback. An outage in live counts returns debatingNow=null while durable data stays available. A durable query failure remains an error, never stale success.

The unused root getCachedUserProfile helper was removed after a full source caller search. The active cache writer and Node reader remain. No cache, index, Redis Pub/Sub or distributed rate limiter was added: the measured improvement came from eliminating per-row work, and there is no production traffic/cache hit-rate evidence yet.

## Local query measurement

Environment: PostgreSQL 16.1, Windows amd64 / Intel i5-12500H, work_mem=4 MB, Go compiler concurrency 2, one loopback connection. The fixture derives from the inspected profile/debate schema, with synthetic records and its test indexes; it is not a clone of production cardinality or statistics. ANALYZE runs after seeding. These warm single-client measurements do not include internet latency or representative production concurrency.

The checked-in performance test captures the actual Repository.List/Me SQL using a pgx tracer. Each endpoint uses one SQL query. It compares JSON results before timing, then alternates old/new execution order for seven warm samples. Medians, maxima and EXPLAIN ANALYZE/BUFFERS summaries are printed; elapsed-time thresholds are deliberately not flaky CI assertions.

At 1,000 profiles and 10,000 debates:
- Seasonal list median: 19.291 ms before, 17.810 ms after.
- Seasonal personal rank median: 17.984 ms before, 16.171 ms after.
- All-time control queries are unchanged: list 3.070/4.235 ms and personal 3.540/3.060 ms show ordinary timing noise.

At 10,000 profiles and 100,000 debates:
- Seasonal list median: 404.140 ms before, 257.172 ms after (36.4% lower); maxima 499.059/367.229 ms.
- Seasonal personal rank median: 264.408 ms before, 202.080 ms after (23.6% lower); maxima 348.776/220.330 ms.
- All-time control medians: list 44.852/50.005 ms and personal 49.802/51.123 ms; no all-time speedup is claimed.

For the larger fixture, EXPLAIN execution time was 609.838/305.526 ms for seasonal list and 357.450/234.336 ms for personal rank. Both versions reported zero temporary blocks written. Shared hits were approximately unchanged (2,162 before / 2,169 after). EXPLAIN instrumentation has overhead and these single samples are distinct from the seven-sample endpoint medians.

The aggregate must still inspect qualifying seasonal debates and rank the profiles. Adding an arbitrary single-column index does not eliminate that work. No live index recommendation is justified from this test alone. Revisit query plans, traffic and pool waits using representative staging data before deciding on an index, materialized aggregate or cache.

## Query volume and cache ownership

A rankings page can issue a list query and a personal-rank query, each one database round trip; each computes its own ranking. Canonical profile reads use one read-only transaction containing profile/rank and bounded latest-20 history queries. Realtime revision polling uses one bounded subscribed-room query every 250 ms while subscriptions exist, then loads changed rooms; this phase does not change its cadence.

Fully Go-selected landing stats uses two independent HTTP reads: durable statistics and current Go room counts. Those calls previously ran in sequence; they now overlap. This phase verifies concurrency with controlled promises, rather than claiming a production latency percentage from mocked network delays. The public Go durable path creates zero legacy Supabase clients.

There is no new leaderboard cache or invalidation policy to maintain. Rankings read committed PostgreSQL state; failed queries return an error. If future measurements justify a cache, specify bounded storage, TTL, and a key including type/section/period/country/page and season definition, plus invalidation for result/rating commits, profile edits, country changes and deletions. Do not cache an authenticated personal response under a shared public key.

The legacy profile cache stores username/avatarUrl at sp:profile:<user> for 24 hours. Node socket authentication warms it, and the legacy profile PATCH refreshes it from the committed canonical row. Go profile writes do not update that legacy cache. Therefore mixed production writers still require a reviewed bridge or coordinated drain; do not enable production profile writes merely because this phase passes.

## Remaining Redis consumers

- server/src/state/roomStore.ts owns active IDs, room state, members, phases, chat history, featured queues and skip votes. Most room keys use two-hour expiry; active-set cleanup is explicit.
- server/src/state/voteStore.ts owns legacy per-user votes and totals, with 30-minute expiry. Legacy finalization consumes and clears these records.
- server/src/auth/socketAuth.ts writes the profile cache; server/src/rooms/roomManager.ts reads it on joins.
- Root app/api/profile/me/route.ts writes that cache only on the legacy PATCH path.
- Root app/api/stats/route.ts reads active IDs plus one member-count command per active room only when the selected room backend is legacy.
- The Go module has no Redis client or direct Redis imports. Go chat/presence use process memory; votes/results/Elo/lifecycle use PostgreSQL. Provider SDK transitive packages do not establish a Go application Redis dependency.

Retain @upstash/redis, both environment configurations and server/ until those consumers have no live traffic and all cutover gates pass. Removing the unused root cache reader is safe; deleting the cache writer, dependency, credentials or room keys is not part of this slice. This work did not connect to or delete data from Redis.

Regression tests simulate unavailable Redis and reject unexpected imports. Fully Go-selected stats/profile operations never load Redis. Mixed Go-profile/legacy-room stats still read legacy live counts and return null on outage; Go room failure never falls back to unrelated legacy counts. Legacy profile cache failure reports cacheUpdated=false while preserving a successful canonical save. These are controlled outage tests, not a claim that the historical Upstash DNS issue is resolved or that legacy rooms work without Redis.

## Memory and per-user chat limits

At the configured 128 retained rooms and 200 messages each, a synthetic fixture with unique 280-byte ASCII bodies and 64-byte names retained 14,290,360 heap bytes (about 13.6 MiB). After 46 minutes of simulated idle time and the next service access, the retained heap delta was 5,952 bytes. GC sampling is noisy; these are heap samples, not total process RSS or a maximum for multibyte strings.

The steady-state send benchmark at room capacity measured 8,156 ns/op, 2,127 allocated bytes/op and 6 allocations/op. No chat algorithm change is justified by this measurement. Additional race-tested checks establish one new message per user/second across rooms, no bypass by forgetting/rejoining a room, a 4,096-user rate-map bound, and recovery after expiry. Existing tests cover retries, history order/limits and room eviction.

History/receipt expiry is access-driven, not a background timer; an entirely idle process can retain its bounded history until the next access. Process restart discards chat as already documented. Connection presence and room-state recovery retain their existing contracts.

Other bounds remain 512 sockets (8/user), 128 subscribed rooms, 1,024 tickets, 64 queued messages/256 KiB per connection and 128 KiB command receipts per connection. Queue and receipt payload budgets alone could reach 192 MiB at 512 connections, before in-flight messages, snapshots, chat, runtime/SDK and database pools. Do not interpret a low chat heap sample or GOMEMLIMIT as proof of whole-process capacity; choose staging/production memory limits from complete workload measurements.

## Reproduce and validate

From backend, set SETPIECE_PERFORMANCE_TEST_DATABASE_URL in the test process to a NEW EMPTY PostgreSQL database named setpiece_m4_perf_<unique suffix>, hosted at 127.0.0.1 with exactly sslmode=disable. The test rejects other hosts/names/settings and existing auth/profiles schema. It does not load backend/.env. Never substitute DATABASE_URL or a Supabase connection.

~~~sh
go test -p 1 ./internal/leaderboard -run TestLeaderboardPerformance -count=1 -v -timeout 240s
go test -p 1 ./internal/chat -run TestChatMemoryEnvelope -count=1 -v
go test -p 1 ./internal/chat -run '^$' -bench BenchmarkChatSendAtCapacity -benchmem
go test -p 1 -race ./...
go vet ./...
go build ./...
~~~

Each measured query run requires a fresh database. The reference pre-4C expansion remains test-only so future changes can reproduce the comparison. The synthetic schema is never a production migration.

Root checks:

~~~sh
npm run test:efficiency
node --test tests/*.test.mjs
npm run build
~~~

Use both Go and legacy selections for production frontend builds, and fresh guarded account/community/profile databases for backend integration. Record the validation outcome in MIGRATION_PLAN.md. No elapsed-time CI pass threshold is imposed.

Final verification passed: full backend race suite with account/community/old-profile SQL fixtures, vet/build; all 38 frontend tests; TypeScript and production builds with both Go and legacy selections; targeted lint (no errors/warnings). The documented test:efficiency command also passed. Temporary PostgreSQL was stopped afterward. Source credential-pattern scanning, diff whitespace, local documentation links and unchanged original checkout checks passed.

## Cutover and rollback

Phase 4C needs no migration and changes no cache contents. The query change is reversible independently of frontend routing. Production still requires integrated staging, signed-in Auth/profile/forum/support flows, actual Supabase notification delivery, media/autoplay/mobile checks, scoped roles/RLS/RPC restrictions and legacy Redis continuity.

The next phase should prepare and validate those gates before any production rollout or retirement. In particular, drain legacy rooms before deleting their only Redis state. No production deployment, legacy shutdown or dependency removal is authorized by this phase.
