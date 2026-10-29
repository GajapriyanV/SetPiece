-- Isolated fixture derived from deployed schema metadata on 2026-10-11. NEVER an application migration.
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

ALTER TABLE auth.users ADD COLUMN email text;
ALTER TABLE public.profiles ADD COLUMN is_admin boolean NOT NULL DEFAULT false, ADD COLUMN registration_complete boolean NOT NULL DEFAULT false;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE public.forum_threads (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"author_id" uuid,
"title" text NOT NULL,
"body" text NOT NULL,
"flair" text NOT NULL,
"is_featured" bool DEFAULT false NOT NULL,
"is_closed" bool DEFAULT false NOT NULL,
"upvotes_count" int4 DEFAULT 0 NOT NULL,
"reply_count" int4 DEFAULT 0 NOT NULL,
"created_at" timestamptz DEFAULT now() NOT NULL,
"closes_at" timestamptz DEFAULT (now() + '7 days'::interval) NOT NULL
);
CREATE TABLE public.forum_replies (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"thread_id" uuid NOT NULL,
"parent_reply_id" uuid,
"author_id" uuid,
"body" text NOT NULL,
"upvotes_count" int4 DEFAULT 0 NOT NULL,
"is_mvp" bool DEFAULT false NOT NULL,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE public.forum_likes (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"target_type" text NOT NULL,
"target_id" uuid NOT NULL,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE public.forum_reports (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"reporter_id" uuid,
"target_type" text NOT NULL,
"target_id" uuid NOT NULL,
"reason" text NOT NULL,
"custom_reason" text,
"is_reviewed" bool DEFAULT false NOT NULL,
"created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE public.notifications (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid,
"type" text NOT NULL,
"thread_id" uuid,
"reply_id" uuid,
"actor_id" uuid,
"is_read" bool DEFAULT false,
"created_at" timestamptz DEFAULT now(),
"count" int4 DEFAULT 1 NOT NULL
);
CREATE TABLE public.contact_tickets (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid,
"name" text NOT NULL,
"email" text NOT NULL,
"subject" text NOT NULL,
"message" text NOT NULL,
"is_reviewed" bool DEFAULT false,
"created_at" timestamptz DEFAULT now()
);
ALTER TABLE public.contact_tickets ADD CONSTRAINT "contact_tickets_pkey" PRIMARY KEY (id);
ALTER TABLE public.forum_likes ADD CONSTRAINT "forum_likes_pkey" PRIMARY KEY (id);
ALTER TABLE public.forum_likes ADD CONSTRAINT "forum_likes_target_type_check" CHECK ((target_type = ANY (ARRAY['thread'::text, 'reply'::text])));
ALTER TABLE public.forum_likes ADD CONSTRAINT "forum_likes_user_id_target_type_target_id_key" UNIQUE (user_id, target_type, target_id);
ALTER TABLE public.forum_replies ADD CONSTRAINT "forum_replies_pkey" PRIMARY KEY (id);
ALTER TABLE public.forum_reports ADD CONSTRAINT "forum_reports_pkey" PRIMARY KEY (id);
ALTER TABLE public.forum_reports ADD CONSTRAINT "forum_reports_reason_check" CHECK ((reason = ANY (ARRAY['Spam'::text, 'Hate speech'::text, 'Misinformation'::text, 'Harassment'::text, 'Off-topic'::text, 'Other'::text])));
ALTER TABLE public.forum_reports ADD CONSTRAINT "forum_reports_target_type_check" CHECK ((target_type = ANY (ARRAY['thread'::text, 'reply'::text])));
ALTER TABLE public.forum_threads ADD CONSTRAINT "forum_threads_pkey" PRIMARY KEY (id);
ALTER TABLE public.notifications ADD CONSTRAINT "notifications_pkey" PRIMARY KEY (id);
ALTER TABLE public.notifications ADD CONSTRAINT "notifications_type_check" CHECK ((type = ANY (ARRAY['thread_reply'::text, 'reply_reply'::text, 'thread_like'::text, 'reply_like'::text, 'mvp_awarded'::text])));
ALTER TABLE public.contact_tickets ADD CONSTRAINT "contact_tickets_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.forum_likes ADD CONSTRAINT "forum_likes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.forum_replies ADD CONSTRAINT "forum_replies_author_id_fkey" FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.forum_replies ADD CONSTRAINT "forum_replies_parent_reply_id_fkey" FOREIGN KEY (parent_reply_id) REFERENCES forum_replies(id) ON DELETE CASCADE;
ALTER TABLE public.forum_replies ADD CONSTRAINT "forum_replies_thread_id_fkey" FOREIGN KEY (thread_id) REFERENCES forum_threads(id) ON DELETE CASCADE;
ALTER TABLE public.forum_reports ADD CONSTRAINT "forum_reports_reporter_id_fkey" FOREIGN KEY (reporter_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.forum_threads ADD CONSTRAINT "forum_threads_author_id_fkey" FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.notifications ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT "notifications_reply_id_fkey" FOREIGN KEY (reply_id) REFERENCES forum_replies(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT "notifications_thread_id_fkey" FOREIGN KEY (thread_id) REFERENCES forum_threads(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
CREATE INDEX idx_forum_likes_target ON public.forum_likes USING btree (target_type, target_id);
CREATE INDEX idx_forum_likes_user ON public.forum_likes USING btree (user_id);
CREATE INDEX idx_forum_replies_thread ON public.forum_replies USING btree (thread_id, created_at);
CREATE INDEX idx_forum_replies_parent ON public.forum_replies USING btree (parent_reply_id);
CREATE INDEX idx_forum_threads_created ON public.forum_threads USING btree (created_at DESC);
CREATE INDEX idx_forum_threads_flair ON public.forum_threads USING btree (flair);
CREATE INDEX idx_forum_threads_closes ON public.forum_threads USING btree (closes_at) WHERE (is_closed = false);
CREATE OR REPLACE FUNCTION public.handle_forum_reply_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
  BEGIN
    IF TG_OP = 'INSERT' THEN
      UPDATE forum_threads SET reply_count = reply_count + 1 WHERE id = NEW.thread_id;
    ELSE
      UPDATE forum_threads SET reply_count = GREATEST(0, reply_count - 1) WHERE id = OLD.thread_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
  END;
  $function$
;
CREATE OR REPLACE FUNCTION public.handle_new_reply_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
  DECLARE
    v_thread_author uuid;
    v_parent_author uuid;
  BEGIN
    SELECT author_id INTO v_thread_author FROM forum_threads WHERE id = NEW.thread_id;

    IF NEW.parent_reply_id IS NULL THEN
      -- Top-level reply → notify thread author (not self)
      IF v_thread_author IS NOT NULL AND v_thread_author != NEW.author_id THEN
        INSERT INTO notifications (user_id, type, thread_id, reply_id, actor_id)
        VALUES (v_thread_author, 'thread_reply', NEW.thread_id, NEW.id, NEW.author_id);
      END IF;
    ELSE
      -- Nested reply → notify parent reply author (not self)
      SELECT author_id INTO v_parent_author FROM forum_replies WHERE id = NEW.parent_reply_id;
      IF v_parent_author IS NOT NULL AND v_parent_author != NEW.author_id THEN
        INSERT INTO notifications (user_id, type, thread_id, reply_id, actor_id)
        VALUES (v_parent_author, 'reply_reply', NEW.thread_id, NEW.id, NEW.author_id);
      END IF;
    END IF;

    RETURN NEW;
  END;
  $function$
;
CREATE OR REPLACE FUNCTION public.handle_forum_like_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$   
  DECLARE
    v_author_id uuid;
    v_thread_id uuid;
    v_delta integer;
    v_existing_notif_id uuid;
  BEGIN
    IF TG_OP = 'INSERT' THEN
      v_delta := 1;

      IF NEW.target_type = 'thread' THEN
        SELECT author_id INTO v_author_id FROM forum_threads WHERE id = NEW.target_id;
        UPDATE forum_threads SET upvotes_count = upvotes_count + 1 WHERE id = NEW.target_id;
      ELSE
        SELECT author_id, thread_id INTO v_author_id, v_thread_id FROM forum_replies WHERE id = NEW.target_id;
        UPDATE forum_replies SET upvotes_count = upvotes_count + 1 WHERE id = NEW.target_id;
      END IF;

      IF v_author_id IS NOT NULL AND v_author_id != NEW.user_id THEN
        IF NEW.target_type = 'thread' THEN
          SELECT id INTO v_existing_notif_id FROM notifications
            WHERE user_id = v_author_id AND type = 'thread_like'
              AND thread_id = NEW.target_id AND is_read = false
            LIMIT 1;
          IF v_existing_notif_id IS NOT NULL THEN
            UPDATE notifications SET count = count + 1, actor_id = NEW.user_id WHERE id = v_existing_notif_id;
          ELSE
            INSERT INTO notifications (user_id, type, thread_id, reply_id, actor_id, count)
            VALUES (v_author_id, 'thread_like', NEW.target_id, NULL, NEW.user_id, 1);
          END IF;
        ELSE
          SELECT id INTO v_existing_notif_id FROM notifications
            WHERE user_id = v_author_id AND type = 'reply_like'
              AND reply_id = NEW.target_id AND is_read = false
            LIMIT 1;
          IF v_existing_notif_id IS NOT NULL THEN
            UPDATE notifications SET count = count + 1, actor_id = NEW.user_id WHERE id = v_existing_notif_id;
          ELSE
            INSERT INTO notifications (user_id, type, thread_id, reply_id, actor_id, count)
            VALUES (v_author_id, 'reply_like', v_thread_id, NEW.target_id, NEW.user_id, 1);
          END IF;
        END IF;
      END IF;

    ELSE
      v_delta := -1;

      IF OLD.target_type = 'thread' THEN
        SELECT author_id INTO v_author_id FROM forum_threads WHERE id = OLD.target_id;
        UPDATE forum_threads SET upvotes_count = GREATEST(0, upvotes_count - 1) WHERE id = OLD.target_id;

        IF v_author_id IS NOT NULL AND v_author_id != OLD.user_id THEN
          SELECT id INTO v_existing_notif_id FROM notifications
            WHERE user_id = v_author_id AND type = 'thread_like'
              AND thread_id = OLD.target_id AND is_read = false
            LIMIT 1;
          IF v_existing_notif_id IS NOT NULL THEN
            UPDATE notifications SET count = count - 1 WHERE id = v_existing_notif_id;
            DELETE FROM notifications WHERE id = v_existing_notif_id AND count <= 0;
          END IF;
        END IF;

      ELSE
        SELECT author_id INTO v_author_id FROM forum_replies WHERE id = OLD.target_id;
        UPDATE forum_replies SET upvotes_count = GREATEST(0, upvotes_count - 1) WHERE id = OLD.target_id;

        IF v_author_id IS NOT NULL AND v_author_id != OLD.user_id THEN
          SELECT id INTO v_existing_notif_id FROM notifications
            WHERE user_id = v_author_id AND type = 'reply_like'
              AND reply_id = OLD.target_id AND is_read = false
            LIMIT 1;
          IF v_existing_notif_id IS NOT NULL THEN
            UPDATE notifications SET count = count - 1 WHERE id = v_existing_notif_id;
            DELETE FROM notifications WHERE id = v_existing_notif_id AND count <= 0;
          END IF;
        END IF;
      END IF;
    END IF;

    IF v_author_id IS NOT NULL THEN
      UPDATE profiles SET upvotes_received = GREATEST(0, upvotes_received + v_delta) WHERE id = v_author_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
  END;
  $function$
;
CREATE OR REPLACE FUNCTION public.close_thread_if_expired(p_thread_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
  DECLARE
    v_reply_id uuid;
    v_author_id uuid;
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM forum_threads
      WHERE id = p_thread_id AND is_closed = false AND closes_at < now()
    ) THEN RETURN; END IF;

    SELECT id, author_id INTO v_reply_id, v_author_id
    FROM forum_replies
    WHERE thread_id = p_thread_id AND parent_reply_id IS NULL
    ORDER BY upvotes_count DESC, created_at ASC
    LIMIT 1;

    IF v_reply_id IS NOT NULL THEN
      UPDATE forum_replies SET is_mvp = true WHERE id = v_reply_id;
      UPDATE profiles SET mvp_count = mvp_count + 1 WHERE id = v_author_id;
      INSERT INTO notifications (user_id, type, thread_id, reply_id, actor_id)
      VALUES (v_author_id, 'mvp_awarded', p_thread_id, v_reply_id, NULL);
    END IF;

    UPDATE forum_threads SET is_closed = true WHERE id = p_thread_id;
  END;
  $function$
;
CREATE TRIGGER trg_forum_like_delete AFTER DELETE ON public.forum_likes FOR EACH ROW EXECUTE FUNCTION handle_forum_like_change();
CREATE TRIGGER trg_forum_like_insert AFTER INSERT ON public.forum_likes FOR EACH ROW EXECUTE FUNCTION handle_forum_like_change();
CREATE TRIGGER on_new_reply_notification AFTER INSERT ON public.forum_replies FOR EACH ROW EXECUTE FUNCTION handle_new_reply_notification();
CREATE TRIGGER trg_forum_reply_delete AFTER DELETE ON public.forum_replies FOR EACH ROW EXECUTE FUNCTION handle_forum_reply_change();
CREATE TRIGGER trg_forum_reply_insert AFTER INSERT ON public.forum_replies FOR EACH ROW EXECUTE FUNCTION handle_forum_reply_change();
ALTER TABLE public.forum_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_can_read" ON public.contact_tickets FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));
CREATE POLICY "admins_can_update" ON public.contact_tickets FOR UPDATE TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));
CREATE POLICY "anyone_can_submit" ON public.contact_tickets FOR INSERT TO PUBLIC WITH CHECK (true);
CREATE POLICY "forum_likes_delete" ON public.forum_likes FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));
CREATE POLICY "forum_likes_insert" ON public.forum_likes FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "forum_likes_read" ON public.forum_likes FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));
CREATE POLICY "forum_replies_auth_insert" ON public.forum_replies FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = author_id));
CREATE POLICY "forum_replies_delete" ON public.forum_replies FOR DELETE TO PUBLIC USING (((auth.uid() = author_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));
CREATE POLICY "forum_replies_public_read" ON public.forum_replies FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "forum_reports_admin_read" ON public.forum_reports FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));
CREATE POLICY "forum_reports_admin_update" ON public.forum_reports FOR UPDATE TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));
CREATE POLICY "forum_reports_insert" ON public.forum_reports FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = reporter_id));
CREATE POLICY "forum_threads_admin_update" ON public.forum_threads FOR UPDATE TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));
CREATE POLICY "forum_threads_auth_insert" ON public.forum_threads FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = author_id));
CREATE POLICY "forum_threads_delete" ON public.forum_threads FOR DELETE TO PUBLIC USING (((auth.uid() = author_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));
CREATE POLICY "forum_threads_public_read" ON public.forum_threads FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "users_own_notifications" ON public.notifications FOR ALL TO PUBLIC USING ((user_id = auth.uid()));
