# Local production-readiness rehearsal

This phase is local preparation authorized on 2026-10-16. Production write/media guards remain enabled. That local verification did not change remote schema, grants, roles or deployments. The subsequent authorized existing-development migration has its own record in [DEVELOPMENT.md](DEVELOPMENT.md). Repeat the checks with `node scripts/rehearse.cjs --race` from backend; prerequisites are in [DEPLOYMENT.md](DEPLOYMENT.md).

## Durable room ownership

[Migration 0004](migrations/0004_runtime_ownership.sql) adds one private ownership row. A new lifecycle runtime must obtain the existing session advisory lock, then replace the ownership token before recovery or serving traffic. Runtime startup requires migration 0004; startup never applies DDL. Direct PostgreSQL or a session pooler is required for the dedicated connection; transaction pooling cannot preserve this session lock.

Each room creation/update and vote acceptance/finalization transaction locks the ownership row FOR SHARE and compares the runtime's token before locking domain rows. The lock stays until commit/rollback. A replacement's UPDATE must wait for these transactions; after its token commits, the old token cannot authorize new writes. Lock order is ownership row, room, debate, then profiles in ID order. Existing test fixtures can use unowned repository constructors, but the running lifecycle composition always uses owned constructors.

The dedicated session is checked every 250 ms with a one-second query timeout. Query failure or loss of the advisory lock irreversibly cancels that runtime. Readiness/new HTTP work fail closed; request contexts, lifecycle/voting workers and media reconciliation are cancelled, WebSockets close, and the process returns an error. It does not silently reacquire ownership. These are scheduling/time-out targets, not a hard real-time guarantee. Graceful shutdown still drains before releasing its lease. Cleanup is idempotent and closes the lease connection instead of returning a session lock to the pool.

The explicit migration command also locks and invalidates an existing ownership row after obtaining the advisory lock, so a dead owner's in-flight transaction finishes before migration starts. The additive migration set remains atomic and checksum checked.

This fences cooperating PostgreSQL room/vote writers, not arbitrary privileged SQL or an already-issued external LiveKit request. Media cancellation cannot retract an RPC that the provider has already accepted. Rolling replacement remains stop/drain/start; do not claim safe overlapping media owners or high-availability failover. All profile/community writes remain transactional and use cancelled HTTP contexts on lease loss, but the token applies specifically to room/vote mutations. Staging must exercise provider outages and deployment overlap before remote writes are enabled.

## Restricted runtime and browser access

[security/local-cutover.sql](security/local-cutover.sql) is a guarded fixture candidate, deliberately outside the automatic migration set. It requires loopback PostgreSQL and a setpiece_m5_test_* database and creates a fresh role. It is not a production script or an idempotent grant-management tool. Its passwordless LOGIN works only in the runner's temporary loopback trust cluster; provision real credentials separately for staging.

The candidate's setpiece_app role has no superuser, role/database creation, replication, BYPASSRLS, or ownership privileges. Explicit table/column grants and role-specific RLS policies support the Go modules. The role can read the required Auth columns but cannot modify Auth, set profiles.is_admin, delete profiles, create tables, truncate application tables, execute the old closure RPC or access the migration ledger. It can update ratings and awards because those are server-owned business operations. A backend credential is therefore still privileged and must never reach clients.

The fixture reproduces inspected broad grants and an owner-profile UPDATE policy, demonstrates protected-field changes are possible, then rolls that attempt back. The candidate removes INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER from PUBLIC, anon and authenticated on the nine migrated application tables, including independent column grants. Existing SELECT/RLS is retained. Direct closure RPC execution is revoked, and retained SECURITY DEFINER trigger functions use pg_catalog, public, pg_temp with untrusted CREATE on public removed. Trigger effects remain authoritative.

The inspected metadata dated 2026-10-11 is the baseline, not proof of today's deployed privileges. The local fixture does not reproduce every Supabase-managed role/default grant or service. In particular, legacy chat_messages, service_role and other inherited roles, function EXECUTE ACLs/default privileges, Storage, Auth and Realtime require an explicit staging audit. Table revocations do not remove access obtained through another role or SECURITY DEFINER function. Removing browser mutations must be coordinated with every remaining legacy/direct Supabase caller; these local changes do not revoke their production access.

## Acceptance evidence and remaining work

The race-enabled rehearsal checks lease termination, takeover waiting for an in-flight transaction, stale-token rejection before heartbeat detection, and replacement independence from old cleanup. The integrated composition runs profile/forum/support, counter triggers, WebSockets/chat, voting/results/rankings and restart as setpiece_app. It terminates the dedicated lease backend while other pooled connections remain available, expects process exit, restarts and checks committed wins remain unchanged. Permission tests check effective table/column mutation grants and representative denied requests, including protected profile columns, contact/forum inserts and the closure RPC. Migration rollback/checksums/reruns and synthetic dump/restore still run; the ledger now has four records.

Remaining staging gates:

- Refresh table/column/schema/function/default grants and role membership; use a separate migration owner and restricted runtime login. Validate RLS and all retained trigger effects against the real schema.
- Audit historical reply constraints/MVPs, legacy chat/direct writers and role-based bypasses. Design a coordinated cutover and rollback of grants; do not restore the unsafe closure RPC speculatively.
- Verify real Auth cookies/OAuth, avatar Storage, notification Realtime, microphone/autoplay/mobile and LiveKit provider outage behavior.
- Exercise actual session-pooler failure, network partitions, deployment stop/start and backup restoration with ownership/grants. The local --no-owner/--no-privileges dump restore does not validate production permission restoration.

References: [PostgreSQL row and advisory locks](https://www.postgresql.org/docs/16/explicit-locking.html), [PostgreSQL privileges](https://www.postgresql.org/docs/16/sql-grant.html).

## Local hardening verification record

Verified on 2026-10-16: the guarded ownership SQL and restricted-role integrated rehearsals passed under the race detector, including lease termination, waiting-transaction takeover, stale-token rejection, permission denials, real composition recovery, migration rerun and synthetic backup/restore. Full backend race tests, go vet and go build passed. The updated Linux image sha256:d295ab6e444e40c7c39d04cfff1bba25d0a73288ac77b06ed17c972f75fe8d36 passed the container acceptance runner; graceful shutdown took 0.525 seconds. Container fixtures and the private Docker engine were cleaned up; the temporary Windows PostgreSQL cluster was stopped. Source credential-pattern, documentation-link and whitespace checks passed. No frontend code changed, so frontend tests were not repeated. No production data/schema/grant changes, deployment, commit or push occurred. The original checkout retains eight changed files (183 additions/57 deletions).
