-- Disposable integration fixture derived from the inspected profile-read columns.
-- This is NOT a Supabase migration and must never run against the application DB.
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, created_at timestamptz);
CREATE TABLE public.profiles (
 id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 username text UNIQUE, name text, country text, club text, created_at timestamptz DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 elo integer NOT NULL DEFAULT 1200, wins integer NOT NULL DEFAULT 0,
 losses integer NOT NULL DEFAULT 0, draws integer NOT NULL DEFAULT 0,
 debates_count integer NOT NULL DEFAULT 0,
 username_changed_at timestamptz NOT NULL DEFAULT '2000-01-01T00:00:00Z',
 avatar_url text, upvotes_received integer NOT NULL DEFAULT 0, mvp_count integer NOT NULL DEFAULT 0
);
CREATE TABLE public.debates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_code text NOT NULL,
 topic text NOT NULL, side_a_label text NOT NULL, side_b_label text NOT NULL,
 debater_a_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 debater_b_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 winner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 result text CHECK (result IN ('side_a','side_b','draw')),
 votes_a integer NOT NULL DEFAULT 0, votes_b integer NOT NULL DEFAULT 0,
 elo_change integer, status text NOT NULL DEFAULT 'lobby'
 CHECK (status IN ('lobby','side_pick','live','voting','finished','cancelled')),
 started_at timestamptz, finished_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_profile_read ON public.profiles FOR SELECT USING (true);
ALTER TABLE public.debates ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_debate_read ON public.debates FOR SELECT USING (true);

-- Existing deployed vote contract, also used by phase 2B fixtures.
CREATE TABLE public.votes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 debate_id uuid NOT NULL REFERENCES public.debates(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 side text NOT NULL CHECK (side IN ('a','b')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(debate_id,user_id)
);
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;
