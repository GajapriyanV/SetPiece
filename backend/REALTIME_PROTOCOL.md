# Local WebSocket protocol v1 (phase 3A)

Status: implemented for the isolated development runtime. Unprefixed rooms still use Socket.io; phase 3B adds local media integration and Go transport for g2-prefixed URLs. LIFECYCLE_DATABASE_URL must still pass the existing loopback/setpiece_m2_* guard. No live database migration or write is required by this phase.

## Authentication and lifetime

POST /api/realtime/ticket requires an Authorization: Bearer access token and an exact allowed Origin (scheme, host and port). Tokens are verified by the existing Supabase verifier. Its verified expiry now accompanies the identity. A successful response contains ticket, expiresIn and protocolVersion. Tickets contain 256 random bits, expire within 30 seconds or at token expiry, are bound to Origin and can be consumed once.

Connect a standard WebSocket to GET /api/realtime/ws?ticket=... using that ticket. Access tokens never appear in the URL. Missing/unapproved origins, replayed/expired tickets and extra query fields fail before upgrade. Treat tickets as credentials and exclude this query string from reverse-proxy logs as well as application logs.

The implementation uses [coder/websocket v1.8.15](https://pkg.go.dev/github.com/coder/websocket@v1.8.15). Exact Origin validation precedes library acceptance. Compression is disabled. The upgrade bypasses net/http's TimeoutHandler, which does not support hijacking; normal HTTP retains its timeout. Every connection ends at the verified access-token expiry and must obtain fresh authentication to reconnect.

## Envelope, correlation and ordering

Client frames are UTF-8 text JSON objects:

~~~json
{"v":1,"type":"side:pick","requestId":"unique_request_id","data":{"side":"a","revision":17}}
~~~

Version and requestId are required in v1. Request IDs use 1–64 ASCII letters, digits, underscores or hyphens; UUIDs work. Unknown fields, commands, versions, malformed JSON and incompatible data types are rejected. There is no Socket.io framing or polling fallback.

Server envelopes add sequence (monotonically increasing per connection), and roomId/revision for room events. data is an object or null. Every valid command receives a correlated ack on success or room:error with a sanitized code/message. Codes include invalid, forbidden, not_found, stale, conflict, closed, rate_limited, capacity and unavailable. No driver errors or credentials are returned.

Successful command receipts are cached per connection, limited to 128 receipts and 128 KiB. Retrying the same request ID with the same serialized command returns the receipt; changing its payload conflicts. room:join and room:state retries also request current state. The cache is not durable: clients must reconcile uncertain outcomes after reconnect and must not automatically replay arbitrary mutations. Chat and votes have the stronger retry rules below.

The 11 baseline client commands are implemented:

- room:create: topic, sideALabel, sideBLabel; replies with room:created and an ack containing roomId/revision. Creation does not implicitly join.
- room:create_featured: topics array of the same topic fields; existing validation and shuffle rules apply.
- room:join: roomId; explicitly leaves this connection's previous room, joins and returns room:joined with the complete state. Failed switching can leave the prior room; the client must reconcile.
- room:leave: empty object; leaves only this connection. The user's membership survives while another tab remains.
- room:state: empty object; returns room:state_sync.
- side:pick: side a/b and the last authoritative revision.
- side:unpick, side:ready, featured:vote_skip: revision.
- chat:send: body; requestId is the chat retry identity.
- vote:cast: side a/b and explicit debateId. A stale debate ID cannot vote in a reused room. First vote is final; identical retries return the existing receipt.

The 29 baseline server event names and fields remain defined in [the frontend map](../types/socket.ts) and [the legacy server map](../server/src/types/events.ts). Contract tests compare both maps with the Go adapter and exercise every transition-event family. New v1 metadata and ack are additive. Countdown, awaiting_result and closing are explicit durable status values; the phase 3B reducer maps them into the retained UI views. Empty optional sides/debate IDs are null in snapshots. The legacy featured:topic_reveal event retains sidePickEndsAt=0 when no timer is running; its snapshot counterpart is null.

## Authoritative recovery

A snapshot includes roomId/revision/serverTime; topic and labels; members with profile names/avatars, sides, readiness, joinedAt and departAt; both speakers; phase/index/speaker/endsAt; debateId; vote totals and only the caller's ownVote; committed results with per-speaker Elo values; chat; featured topic index/count/completed count; skip voters and threshold; countdownEndsAt, votingEndsAt, sidePickEndsAt, closingAt, recoveryEndsAt and the current deadline. Times are epoch milliseconds except chat createdAt and ledger finishedAt, which are ISO timestamps.

A single repeatable-read transaction loads room, members, profiles, vote totals, member receipts and result ledger. The shared view is filtered into a caller-specific snapshot at delivery. One caller never receives another caller's vote. The source reads the isolated lifecycle database, not the live profile pool.

Room-striped locks serialize commands, snapshots and event enqueueing; connection writers preserve sequence. Every observed committed revision broadcasts advisory baseline deltas followed by a full snapshot. Socket commands refresh immediately. A bounded 250 ms revision query covers subscribed rooms and discovers scheduler, HTTP vote and finalizer commits; only changed rooms are loaded. Nothing is emitted from an uncommitted database transaction.

Polling can coalesce intervening revisions, especially during outages. This is deliberate: events are view-update hints, not a durable event log. Consumers must replace state from snapshots, discard older revisions and request room:state on a sequence/revision gap. They must not reconstruct missed results or phases solely from event history. Media reconciliation now reads current durable state before publishing a revision; it does not derive permissions from this advisory stream.

## Presence, chat and bounds

Each server-generated connection ID is distinct from user identity. One connection subscribes to one room. Abrupt last-connection loss persists the existing 15-second speaker/selected-side or 30-second audience grace; reconnect clears the deadline. Explicit last-connection leave follows the approved domain rules. Restart recovery remains 15 seconds for missing speakers and preserves already-open voting. Failed disconnect persistence retains the closed connection for bounded retry; restart recovery handles a database outage at shutdown.

Chat preserves the observed Redis behavior with bounded process memory: ECMAScript-compatible trimming, nonempty bodies, at most 280 UTF-16 code units, and one new message per user per second across rooms/tabs. History retains 200 messages per room, returns the latest 50 oldest-first, and deduplicates user/room/requestId while its message is retained. Conflicting bodies are rejected. History/receipts expire after 45 idle minutes, are discarded when a room closes and do not survive process restart. No writes use public.chat_messages. The 45-minute idle eviction is an explicit memory-bound policy, not durable chat retention.

Default bounds are 512 connections, 8 per user, 128 subscribed rooms, 1,024 tickets, one ticket issuance per user per second, and 128 retained chat rooms. Chat rate-limit entries are capped at 4,096 and expire after one second. Socket input is at most 16 KiB; commands use a 20/second token bucket with burst 40 per connection. Room creation is additionally limited to once per minute per connection. Outgoing messages are capped at 256 KiB, and each queue at 64 entries/256 KiB; an in-flight write is separately bounded. Slow consumers are disconnected without blocking other clients. Receipts have the separate 128 KiB bound above.

Commands and snapshot queries have three-second contexts. Writes and ping responses have five-second deadlines; ping runs every 20 seconds while the read loop handles pong. Shutdown cancels socket contexts, waits for handlers and closes the local runtime afterward. Closing events drain through the bounded writer before normal terminal cleanup.

These development limits are not a demonstrated production capacity claim. Production still needs measured load, abuse protection for all HTTP endpoints, role/lease review, proxy timeout/log policy and the migration's cutover gates.

## Existing chat table audit

Read-only metadata inspection on 2026-10-10 confirmed public.chat_messages has UUID id/debate_id/user_id, username/body text, and created_at. All are NOT NULL; id and created_at have defaults. The primary key and debate/profile foreign keys exist; no length constraint or application trigger was found. RLS is enabled (not forced), with a public SELECT policy and no write policy in the inspected metadata.

The profile foreign key uses ON DELETE SET NULL despite user_id being NOT NULL. This can block profile deletion if matching chat rows exist; no production rows were read, and this phase does not change that unrelated schema. The audited application still uses Redis for chat. Table contents, historical use and any external writers are unknown, so this work neither treats the table as empty nor migrates/deletes its data.

## Browser adapter and hook audit

[lib/realtime/client.ts](../lib/realtime/client.ts) is now used by hooks/useGoRoom.ts for g2-prefixed room URLs (phase 3B). It requests a fresh token/ticket on each attempt, reconnects with bounded exponential jitter, rejoins desired membership, tracks revisions/sequences and resynchronizes gaps. It rejects pending mutations on loss instead of replaying them. Pending commands are capped at 64 with ten-second acknowledgement deadlines.

Call signOut on Supabase SIGNED_OUT and stop on transport disposal; both cancel reconnect/ticket work and close the socket. The phase 3B hook retrieves the current Supabase session for every attempt. Authentication and reconnection are unit-tested through injected browser primitives; actual browser/Supabase integration is still a phase 3B check.

The original hooks/useRoom.ts cleanup emitted room:leave when isConnected changed, allowing Socket.io to buffer a leave through temporary loss. The new adapter's leave never queues while offline; passive transport cleanup uses stop. Phase 3B now binds Go sign-out/cleanup and prevents legacy cleanup from emitting leave while offline. Route disposal deliberately leaves; transport loss only reconnects. See MEDIA.md for explicit room ownership and media synchronization.

## Verification

Run go test ./..., go vet ./... and go build ./... from backend; use go test -race for concurrency checks. On memory-constrained Windows, use GOMAXPROCS=2, GOMEMLIMIT=256MiB and -p 1. Set SETPIECE_REALTIME_TEST_DATABASE_URL only to a fresh, empty loopback setpiece_m2_test_* database with sslmode=disable to enable the real PostgreSQL/WebSocket suite. It refuses other databases and applies the existing fixture plus migrations 0001/0002 only there.

Tests cover both baseline event maps, transition payload families, recovery snapshot fields, ticket replay/origin/expiry, malformed and oversized frames, connection expiry, bounded slow-client queues and receipts, Unicode chat/rate/retry/history behavior, all 11 commands on real sockets, multi-tab leave/disconnect, room switching, grace/rejoin, all phase snapshots and transactional vote/result recovery. npm run test:realtime covers reconnect jitter, fresh authentication, no mutation replay, no offline queued leave, snapshot-gap recovery and sign-out cleanup.
