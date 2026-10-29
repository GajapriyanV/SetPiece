-- Additive, reviewed against the inspected public.debates/profiles schema.
-- Apply only to an isolated database for phase 2A; never on server startup.
BEGIN;
CREATE SCHEMA setpiece_runtime;
REVOKE ALL ON SCHEMA setpiece_runtime FROM PUBLIC;
CREATE TABLE setpiece_runtime.rooms (
 id text PRIMARY KEY CHECK (id ~ '^[0-9a-f]{8}$'),
 creator_id uuid NOT NULL REFERENCES public.profiles(id),
 revision bigint NOT NULL CHECK (revision > 0),
 capacity integer NOT NULL CHECK (capacity IN (6,50)),
 snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object'),
 next_due timestamptz,
 closed boolean NOT NULL DEFAULT false,
 UNIQUE(id,capacity)
);
CREATE INDEX rooms_due ON setpiece_runtime.rooms(next_due,id) WHERE NOT closed AND next_due IS NOT NULL;
CREATE TABLE setpiece_runtime.members (
 room_id text NOT NULL,
 capacity integer NOT NULL,
 user_id uuid NOT NULL REFERENCES public.profiles(id),
 slot integer NOT NULL CHECK (slot BETWEEN 1 AND capacity),
 side text CHECK (side IN ('a','b')),
 ready boolean NOT NULL DEFAULT false CHECK (NOT ready OR side IS NOT NULL),
 joined_at timestamptz NOT NULL,
 depart_at timestamptz,
 restarting boolean NOT NULL DEFAULT false,
 PRIMARY KEY(room_id,user_id),
 FOREIGN KEY(room_id,capacity) REFERENCES setpiece_runtime.rooms(id,capacity),
 UNIQUE(room_id,slot),
 UNIQUE(room_id,side)
);
CREATE INDEX members_user ON setpiece_runtime.members(user_id);
CREATE TABLE setpiece_runtime.debates (
 debate_id uuid PRIMARY KEY REFERENCES public.debates(id),
 room_id text NOT NULL REFERENCES setpiece_runtime.rooms(id),
 active boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX one_active_debate_per_room ON setpiece_runtime.debates(room_id) WHERE active;
CREATE INDEX lifecycle_debates_room ON setpiece_runtime.debates(room_id);
-- Private runtime schema: no anon/authenticated grants or permissive policies.
ALTER TABLE setpiece_runtime.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE setpiece_runtime.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE setpiece_runtime.debates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA setpiece_runtime FROM PUBLIC;
COMMIT;
