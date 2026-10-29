# Phase 4B community APIs

Implemented and verified locally on 2026-10-12, on setpiece-v2-overhaul. The user approved nested replies capped at depth 20. No production data/schema writes, Auth emails, deployments or live Realtime delivery tests occurred.

## Configuration and ownership

- NEXT_PUBLIC_COMMUNITY_BACKEND=go opts all community Next.js routes into Go and also selects canonical account/profile paths. Rebuild/restart Next.js when changing it. GO_API_URL remains server-only.
- COMMUNITY_DATABASE_URL enables community writes only with APP_ENV=development, host 127.0.0.1, database setpiece_m4_* and exactly sslmode=disable. If PROFILE_DATABASE_URL is set, the URIs must be identical. Account/profile/ranking/statistics reads use this same local application pool.
- DATABASE_URL retains read-only transaction defaults. Without the community write guard, mutations return 503 and detail GET does not finalize expired threads or mutate the existing Supabase database.
- Startup checks for setpiece_runtime.forum_closures; no startup migrations. Prepare a disposable schema before starting a writable preview. Current lifecycle and application fixture databases are isolated tests, not an integrated staging deployment.
- Production remains one Supabase PostgreSQL database. Before lifting local guards, prepare scoped privileges, coordinated legacy writer ownership and an integrated staging database with all schema slices.

## Verified database evidence

The read-only inspector verified public.forum_threads, forum_replies, forum_likes, forum_reports, notifications and contact_tickets, their constraints/indexes/defaults, RLS/grants and notification publication membership. The ignored metadata export contains definitions, not a production data dump. Test fixtures reproduce the definitions with synthetic users and .invalid email addresses.

Five deployed triggers invoke three counter/notification functions; the separate close_thread_if_expired function performs legacy closure:

- handle_forum_reply_change maintains reply counts on insert/delete.
- handle_new_reply_notification notifies the thread author for a top-level reply, or parent author for a nested reply, excluding self-notifications.
- handle_forum_like_change maintains target counts and author upvotes_received. It aggregates unread like notifications and removes them when the count reaches zero; read notification history is retained.
- close_thread_if_expired lacks the lock/receipt needed for concurrent/reopened finalization. Go never calls it.

Go retains the three trigger functions unchanged; it does not also increment their counters or send duplicate notifications. The existing unique (user_id,target_type,target_id) constraint arbitrates likes. Because polymorphic target_id has no foreign key, Go deletes associated likes before deleting content so the retained triggers still see the target author. Thread and reply deletion preserve verified cascade behavior. Deleted authors remain representable through nullable profile foreign keys.

The original parent_reply_id FK references reply ID only. Migration 0003 adds a composite same-thread FK NOT VALID, enforcing new links without silently repairing old data. Go rejects deletion where legacy cross-thread descendants would otherwise be removed by cascading foreign keys. Audit and repair malformed legacy links/cycles before validating the new constraint; do not apply an unreviewed cleanup to production.

The notifications table belongs to supabase_realtime. Its RLS scopes rows to the recipient. This proves publication configuration, not delivery through a live subscription.

## HTTP and authorization

Public GET /api/forum and GET /api/forum/{id} allow anonymous access. An included bearer token must be valid. All mutations and notification/support/admin routes require the verified Supabase subject. Next.js verifies cookie user/session consistency and forwards only that user's bearer token. Go independently verifies it.

The existing 14 community Next.js route files preserve legacy implementations behind the default switch. Go covers thread list/detail/create/delete/admin flags, reply create/delete, thread/reply likes, reporting, report review, notification list/read, contact creation and contact review. Bodyless review/read PATCH requests remain supported.

- Only an author or admin can delete content; only admins change thread flags or review reports/tickets.
- New featured threads require admin permission; non-admin requests are rejected instead of silently downgraded.
- No caller-supplied author, recipient, counters, rating, admin flag or contact identity is accepted. Unknown JSON fields are rejected.
- Contact subject/message derive identity from the authenticated profile and only that user's auth.users email. Private contact details are admin-only.
- Notifications return the recipient's latest 20 plus exact unread count. Mark-one/all read is idempotent; missing or another user's notification returns the same harmless acknowledgement.
- Requests have the existing 16 KiB body limit and bounded query/forwarding timeouts. Errors contain no raw SQL or credentials. Backend failure never triggers mutation replay against legacy.

## Content, pagination and retries

Thread titles and contact subjects are capped at 200 JavaScript UTF-16 units; bodies, replies and contact messages at 2,000. Text is trimmed, valid UTF-8 and NUL-free. Flairs and report reasons use explicit existing lists; invalid values return 400. Other reports require a bounded custom reason.

Replies must reach a root in the same thread, without cycles, and fit depth 20 (top-level reply is depth 1). Server time and closed status reject new replies after expiry. The list uses 20 items per page; detail uses reply_page with 30 flat replyRows plus a compatible replies tree and nextReplyPage. Stable ID ordering resolves timestamp ties. The client merges/deduplicates pages and reattaches children whose parents appear later, with cycle/depth guards. Deleting from the current view refreshes page one so its offset is not reused after self-deletion. Concurrent changes by other users can still shift offset pages.

Go likes require { "liked": true } or { "liked": false }; they are desired-state commands. Identical retries use INSERT ON CONFLICT DO NOTHING or DELETE and return committed liked/upvotes_count. The UI disables concurrent commands for the same target and uses canonical responses. Legacy routes retain their toggle implementation. Likes remain permitted on closed threads; the finalized MVP does not change.

Admin report/contact lists retain a maximum of 100 rows plus total count. Thread list/detail and all protected reads use explicit SQL projections.

## Closure and migration

Every Go thread mutation obtains the parent thread lock before changing content. Writable detail reads lazily finalize naturally expired open threads under that same lock. The private closure ledger, MVP marker, profile count, notification and closed flag commit in one transaction; notification failure rolls all of them back.

Top-level replies compete for MVP by upvotes descending, creation ascending, then ID ascending. A ledger entry also records no-winner closure. Reopening never grants a second award. Manual admin closure retains the old behavior of awarding no MVP; reopening an already-expired thread allows natural finalization on the next writable detail read.

[migration 0003](../migrations/0003_forum_closures.sql) creates the private RLS closure ledger, seeds existing MVP markers without changing counters, and adds the same-thread parent constraint. It does not replace deployed trigger functions. Existing multiple MVP markers, missing historic markers, counter drift and malformed hierarchies require audit; ledger seeding cannot reconstruct deleted historical awards. Run reviewed additive migrations once via a controlled command, after backup and staging checks, never by treating the test fixture as a production migration.

Phase 5 now verifies a local restricted-role candidate that revokes browser mutations/closure RPC access and fixes retained trigger search paths, while real Go flows still pass. It is fixture-only; see [../SECURITY.md](../SECURITY.md).

Before production:
- Audit existing links/cycles/depth/counters and historic MVPs; validate forum_reply_parent_same_thread after approved repairs.
- Restrict direct profile/forum/support writes and execution of the legacy closure RPC so callers cannot bypass Go field checks, depth/locking rules or the closure ledger.
- Review security-definer search_path/execute grants and grant only the required privileges to the runtime role. Broad owner-profile RLS currently permits protected-field bypass; the contact insert policy also permits direct submission.
- Coordinate old Next.js handlers and direct Supabase writers before enabling Go mutations; a flag alone does not revoke their access.
- Review index/constraint installation cost and verify backup/restore before live DDL.

## Verification and remaining acceptance

From backend, configure SETPIECE_COMMUNITY_TEST_DATABASE_URL in the test process to a NEW EMPTY disposable loopback setpiece_m4_test_* database with sslmode=disable. Tests refuse populated fixtures. Do not use DATABASE_URL or the live Supabase URI. go test does not load backend/.env.

~~~sh
go test -race ./internal/forum -count=1
go test -race ./...
go vet ./...
go build ./...
~~~

Separate fresh fixtures use SETPIECE_ACCOUNT_TEST_DATABASE_URL and SETPIECE_TEST_DATABASE_URL for account and old profile contracts. On memory-constrained Windows use -p 1 and a supported C compiler for race builds.

From the repository root:

~~~sh
npm run test:community
node --test tests/*.test.mjs
npx tsc --noEmit --incremental false
npm run build
~~~

Verification passed: full Go race suite, community/account/old profile SQL fixtures, vet/build; targeted final SQL/race regression for the composite FK and malformed legacy deletion; 34 frontend tests; TypeScript; builds with both Go and legacy selections. Targeted lint has no errors and three existing rankings image warnings. Temporary PostgreSQL was stopped.

SQL tests cover authorization/protected fields, 20-level nesting, cross-thread rejection, pagination, concurrent identical likes/unlikes, multi-user notification aggregation, cascade counter cleanup, 16 concurrent finalizers, reopen safety, injected rollback, recipient isolation and canonical contact identity/admin review. Frontend tests cover optional identity forwarding, created responses, no legacy RPC execution on the Go path, bounded reply merging and subscription cleanup/sign-out/late responses.

Remaining acceptance:
- Signed-in member/admin UI: create/reply/page/like/delete/report, expiry/MVP/reopen, notifications read/all-read, support and admin review.
- Actual Supabase INSERT/UPDATE notification delivery, token refresh and account switching through browser sessions.
- Integrated staging with account/lifecycle/community data and real Auth identities; retain phase 3B microphone/autoplay/mobile gates.
- Production RLS/privilege/RPC hardening, legacy-data audit, constraint validation and legacy continuity.

## Rollback

Keep legacy as the default until these gates pass. For an isolated preview, unset NEXT_PUBLIC_COMMUNITY_BACKEND and restart/rebuild; also unset NEXT_PUBLIC_PROFILE_BACKEND if the entire profile slice should return to legacy. Never retry a failed mutation against the old backend automatically. Stop the local writable process when discarding fixtures.

A production rollback after Go writes requires coordinated writer ownership, privilege review and reconciliation; simply re-enabling the unsafe legacy closure RPC could duplicate MVPs. Preserve committed data and the additive ledger, and validate a rollback procedure in staging before cutover.
