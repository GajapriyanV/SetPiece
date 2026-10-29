# Phase 2B: transactional votes, finalization and Elo

Authorized on 2026-10-10. The user explicitly chose first accepted vote is final. This code runs only under the existing development-only LIFECYCLE_DATABASE_URL guard. No migration, fixture or business mutation has run against Supabase.

## Verified schema and compatibility

The metadata export verifies:
- public.votes: UUID primary key/default, required debate_id/user_id/side/created_at, UNIQUE(debate_id,user_id), side in a/b, and foreign keys to debates/profiles with ON DELETE CASCADE.
- public.profiles: required integer Elo/wins/losses/draws/debates_count and required timestamptz updated_at.
- public.debates: compatible status/result checks, nullable speaker/winner foreign keys, integer vote totals and legacy elo_change.
- No custom triggers on these three tables in the inspected schema. The Go transaction owns its counter updates.

Existing uniqueness and foreign keys are reused; no constraint duplication, cleanup or historical rewrite is needed. Migration 0002 adds only setpiece_runtime.results, a private RLS-enabled ledger with one result per Go-owned debate and no PUBLIC grants. It depends on migration 0001. The local fixture includes the verified vote/updated_at fields; it is not a production bootstrap.

The Elo calculation preserves K=32, expectation denominator 400 and JavaScript rounding. The public elo_change field retains speaker A's absolute change. The new ledger records each speaker's ID, username at finalization, old/new Elo and signed delta, including unequal-rating draws. Existing profile history still reports draw delta zero for compatibility; adopting the precise ledger in that UI is a later explicit change.

## Transaction and retry contract

Every writer takes the same lock order: room -> debate -> speaker profiles sorted by UUID. Profile locks use FOR NO KEY UPDATE so unrelated membership foreign-key checks do not conflict with rating changes.

A new vote:
1. Resolves only a private Go ownership mapping; legacy debates are excluded.
2. Locks the room and debate, then checks for an existing vote.
3. Requires a current connected member who is neither speaker.
4. Reads PostgreSQL clock_timestamp() after lock acquisition. The room and debate must still be voting, with that debate ID and an unexpired deadline.
5. Inserts the vote and increments room revision within the transaction. Only a successful commit returns counts/state.

The clock read under the lock defines the acceptance instant, conditional on successful commit. A request received earlier but acquiring the lock after the deadline fails. A vote accepted before the deadline may commit afterward; closure waits for that same lock and includes it.

An identical vote returns its existing receipt without rewriting data or incrementing revision, even after closure or a room's next debate. A different-side retry returns 409. Receipt retries concern only the authenticated caller's own prior vote; fresh votes still require current eligibility. Results are keyed by debate UUID, never just the reusable room code.

Finalization is internal-only and requires voting to be expired or already awaiting_result. It reads durable vote totals, locks both profiles in UUID order, computes ratings/counters and commits all of the following together:
- both profiles' ratings and win/loss/draw/debate counters;
- the debate's final winner/result/totals/legacy delta and finished timestamp;
- its unique private result ledger;
- room results status, revision and 60-second display deadline.

The ledger makes repeated finalization return the same result without changing ratings or extending results display. Failures return no successful state and roll back every write. The scheduler retries unfinished work; cancelled and legacy debates are excluded.

Snapshots use a repeatable-read transaction to return totals, caller's own vote, committed result and room revision consistently. Future transport events must carry room ID, debate ID and revision; ignore results for an older debate even if a reusable room has advanced. No WebSocket publication is implemented in this phase, and no network delivery occurs inside the database transaction.

## HTTP and worker

Enabled only alongside the isolated lifecycle runtime:
- POST /api/debates/{debateId}/votes with {side:"a"|"b"} and the existing Supabase bearer token.
- GET /api/debates/{debateId}/votes for a creator/member, prior voter, or finalized speaker.

Invalid IDs/bodies/sides return 400; missing auth 401; ineligible caller 403; unknown/non-Go debate 404; a conflicting vote or closed window 409; infrastructure errors 503 with no driver details. Caller identity cannot come from JSON/query parameters. Responses are no-store and bounded by the existing HTTP timeouts/body limit. There is no public finalization endpoint.

HTTP calls the transport-neutral voting service directly. Phase 3A's WebSocket adapter will call that same service. The finalization worker processes at most 100 candidate debates per 250ms tick with a bounded context, alongside the lifecycle scheduler. Startup requires both migrations and runs recovery before serving requests. The runtime remains single-owner/local-only.

## Validation

Set SETPIECE_VOTING_TEST_DATABASE_URL only to a NEW EMPTY database named setpiece_m2_test_<suffix> on 127.0.0.1, with sslmode=disable as its only URI query option. The suite refuses an existing profiles table and applies synthetic fixture schema plus migrations 0001/0002 there.

Run go test -race ./internal/voting -count=1. For startup checks afterward, unset that fixture variable and set SETPIECE_LIFECYCLE_SERVER_TEST_DATABASE_URL to the populated disposable database, then run go test -race ./cmd/server. Tests do not load backend/.env or write to its DATABASE_URL.

Verified on PostgreSQL 16.1/Go 1.27.2:
- 20 concurrent identical votes persist one row; mixed-side concurrent requests cannot overwrite it;
- multiple voters produce totals identical to persisted rows;
- 16 concurrent finalizers apply results/counters/Elo once;
- speaker/nonmember/disconnected/invalid/early/late requests are rejected;
- a vote proven to be blocked on a room lock is rejected after that deadline expires, while closure finishes consistently;
- zero-vote unequal-rating draws and wins/losses retain correct signed changes;
- two simultaneous debates sharing both speakers preserve all updates without deadlocks;
- forced ledger-insert failure after profile/debate updates rolls everything back; retry then succeeds;
- snapshots recover committed results, cancelled/legacy debates remain excluded, and repeated worker runs do not duplicate Elo.

Go unit/HTTP suites, race checks, vet and build passed. Earlier profile/lifecycle SQL suites were also checked after sharing the transaction helper and fixture schema.

## Remaining gates

Production remains unchanged. Runtime grants, backup/restore, lease-loss fencing, transport/media parity and the outstanding phase 1 browser/legacy checks remain required before cutover. Existing vote foreign keys cascade on account/debate deletion: retention and account-deletion policy must be reviewed before deployment, since an external deletion can remove historical vote rows even though the final ledger preserves original totals. No account-deletion behavior was changed here.

References: PostgreSQL [row locking and deadlocks](https://www.postgresql.org/docs/current/explicit-locking.html), [clock_timestamp semantics](https://www.postgresql.org/docs/current/functions-datetime.html).
