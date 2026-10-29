-- Additive finalization ledger for Go-owned debates only.
-- Existing public.votes already has UNIQUE(debate_id,user_id), side checks and FKs.
-- No legacy rows, constraints, counters or policies are rewritten.
BEGIN;
CREATE TABLE setpiece_runtime.results (
 debate_id uuid PRIMARY KEY REFERENCES setpiece_runtime.debates(debate_id),
 finalized_at timestamptz NOT NULL,
 result jsonb NOT NULL CHECK (jsonb_typeof(result)='object')
);
ALTER TABLE setpiece_runtime.results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON setpiece_runtime.results FROM PUBLIC;
COMMIT;
