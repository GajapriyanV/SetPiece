# Phase 2A: durable room lifecycle

Approved on 2026-10-10, including the user's explicit choice of a 15-second restart grace. This implementation runs only against a guarded local database. It does not take ownership of existing rooms or require a second production database.

## Evidence and migration

The deployed metadata export verifies public.debates UUID identity, required topic/labels/room_code, nullable speaker foreign keys to profiles, started_at/finished_at, and the existing live/voting/finished/cancelled status values. A fresh read-only inspection verified setpiece_runtime is absent and there is no public room table. public.chat_messages exists, but its use/retention/policies require a separate audit; no rows were read.

0001_room_lifecycle.sql creates a private schema containing:
- rooms: durable snapshot, revision, capacity and indexed next deadline;
- members: profile identity, unique room slot, unique selected side, readiness and departure deadline;
- debates: links only Go-created debates to their rooms, with one active debate per room.

The migration leaves existing tables and policies unchanged. New tables have RLS enabled without public policies; schema/table access is revoked from PUBLIC. An eventual runtime role needs explicit private-schema privileges and appropriate policies or ownership, plus narrowly scoped public.profiles reads and public.debates lifecycle writes. Production grants and backups remain a deployment gate. Current new profile foreign keys restrict profile deletion while lifecycle references remain; account deletion/retention must be reviewed before deployment.

Membership is normalized in PostgreSQL; the JSON snapshot omits its members. Fixed slots (1..6 or 1..50) and a foreign key to room capacity enforce capacity independently of the service. A transaction locks the room, then its debate, then replaces at most 50 membership rows and commits state/revision/deadline. No network/media call runs while holding the lock. Future finalization must use the same lock order and then lock profile IDs consistently.

The real debate ID and live history row commit together with countdown state. Failed persistence returns no successful snapshot and rolls everything back. Lifecycle updates touch only IDs in the private ownership mapping. There are no vote or rating writes.

PostgreSQL references: [row locks](https://www.postgresql.org/docs/current/explicit-locking.html), [constraints](https://www.postgresql.org/docs/current/ddl-constraints.html).

## Rules and intentional corrections

- Regular capacity 6; featured capacity 50. One membership per user, with multiple transport-generated connection IDs. One tab leaving does not evict another tab. Transport will leave a connection's prior room before switching in phase 3A.
- Readiness requires a current member on a side and both distinct speakers connected. Countdown 5 seconds; phases 150/150/60/60/30/30 seconds; voting 30 seconds; results display 60 seconds.
- Featured queues contain 1-15 shuffled topics. Two distinct member skip votes rotate without counting a completion. A 30-second side-pick deadline starts once two members are present. Cancellation repeats the topic; five completions trigger a 30-second closing warning.
- Empty regular rooms close after 3 minutes. Empty featured rooms close after 40 minutes plus a 30-second warning. This also starts at creation, fixing the legacy case where a never-joined featured room never started its inactivity timer.
- Normal speaker/side-picker disconnect grace is 15 seconds; other members get 30 seconds. Explicit final-tab speaker leave cancels countdown/live/unexpired voting immediately. Side changes after countdown starts are rejected.
- Restart marks persisted memberships disconnected. Both countdown/live speakers must return within 15 seconds; repeated restarts preserve an already recorded recovery deadline. If either remains absent, cancel without Elo. Returning speakers retain the absolute phase deadline; overdue phases catch up.
- Debates already voting at restart are preserved even when speakers do not reconnect. Voting expiry enters awaiting_result. Only a committed finished debate releases results display. Phase 2B now calculates/persists votes/results/Elo atomically through the voting service; the lifecycle model cannot invent a result.
- State transitions use persisted absolute deadlines. Old timer revisions fail. Client side/ready/skip commands require the observed revision and fail if a deadline is already due, preventing actions intended for the previous topic from affecting the next one.
- Cleanup marks rooms closed rather than deleting durable history. Physical retention/archival is a later operational decision. Ordinary regular-room side picking has no new timeout; the legacy 60-second helper was not wired.

All corrections above are confined to the isolated Go implementation. Node behavior is unchanged.

## REST and service boundaries

The routes exist only when the lifecycle service is configured:
- POST /api/rooms: authenticated; body {topics:[{topic,sideALabel,sideBLabel}],isFeatured}. Non-featured rooms require exactly one topic. Returns 201 with roomId/revision. Ownership comes only from the verified JWT.
- GET /api/rooms?after=<roomId>&limit=50: public summaries ordered by room ID, max 100. Does not expose members or future topic queues. Follow nextCursor until an empty page.
- GET /api/rooms/{roomId}/state: authenticated creator/member snapshot, version 1, durable deadlines/revision and current phase.

Topics/labels are bounded, unknown JSON fields and trailing bodies are rejected, errors are sanitized, and responses are no-store. These are additive development contracts, not yet the frontend socket payloads.

Join, disconnect, side, ready and skip actions are shared service methods for the future WebSocket adapter. They are not publicly exposed as arbitrary user-ID HTTP commands. No WebSockets, chat, LiveKit or UI room cutover is included.

## Isolated setup and validation

Leave LIFECYCLE_DATABASE_URL unset for the existing profile preview. To exercise lifecycle locally:
1. Create a disposable PostgreSQL database named setpiece_m2_dev_<suffix> on 127.0.0.1.
2. Apply a schema-only baseline compatible with the inspected public.profiles/debates contract, then migrations/0001_room_lifecycle.sql, migrations/0002_debate_results.sql and migrations/0004_runtime_ownership.sql. Use synthetic profiles/Auth IDs for tests. The users/testdata schema is test infrastructure, not a production bootstrap migration.
3. Set LIFECYCLE_DATABASE_URL to that local database URI with only sslmode=disable in its query. The config rejects remote hosts, other database names and production mode. Keep DATABASE_URL pointing at the unchanged read-only profile connection.
4. Start Go normally. Startup checks a dedicated single-owner advisory lock, recovers deadlines, then runs a 250ms scheduler processing at most 100 due rooms per batch. A separate bounded finalizer worker handles expired voting. Startup requires all three lifecycle migrations, but never executes DDL. The separate lifecycle pool uses query/lock timeouts.
5. Disable the setting and restart to remove the routes/worker. There is no production rollback or migration reversal to perform.

SQL tests require SETPIECE_LIFECYCLE_TEST_DATABASE_URL naming a NEW EMPTY setpiece_m2_test_* database on 127.0.0.1 with sslmode=disable. They refuse existing profiles. Run go test -race ./internal/debates. For startup/lease/worker tests, also apply migrations 0002 and 0004 (or reuse the voting suite's populated disposable database, then apply 0004), set SETPIECE_LIFECYCLE_SERVER_TEST_DATABASE_URL, unset fixture variables, and run go test -race ./cmd/server. Never point either variable at Supabase.

Verified with PostgreSQL 16.1 and Go 1.27.2: concurrent capacity/side/start invariants, transaction rollback after a forced SQL constraint failure, multi-tab disconnect, stale timer/client revisions, restart cancellation, voting preservation, result gating/retries, unchanged Elo, query cancellation, fake-clock timing, REST authorization/errors, isolated configuration, startup ownership and scheduler shutdown. Go unit tests, vet, build and race checks pass.

## Remaining gates

Phase 1 still has pending browser token-refresh, profile-edit and legacy-room checks, blocked in part by the existing Redis DNS configuration. Phase 2B now supplies transactional finalization; see VOTING.md. Phase 3 supplies transport/media/frontend parity. Before production, review backup/restore, runtime grants, profile deletion/retention, lease-loss fencing and hosting configuration; remove the local-only guard only as part of authorized cutover. The advisory lock plus migration 0004 now fences room/vote transactions across ownership changes; lease loss stops the process. Local tests cover terminated sessions, waiting transactions and stale tokens. Real partitions and provider RPC behavior remain staging gates; see [../SECURITY.md](../SECURITY.md).
