-- Additive local rehearsal migration. No automatic production application.
BEGIN;
CREATE TABLE setpiece_runtime.owner (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
 token text NOT NULL
);
INSERT INTO setpiece_runtime.owner(singleton,token) VALUES(true,'unclaimed');
ALTER TABLE setpiece_runtime.owner ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON setpiece_runtime.owner FROM PUBLIC;
COMMIT;
