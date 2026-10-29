-- Isolated phase 4B only. No startup DDL; no deployed functions are replaced here.
BEGIN;
CREATE SCHEMA IF NOT EXISTS setpiece_runtime;
REVOKE ALL ON SCHEMA setpiece_runtime FROM PUBLIC;
CREATE TABLE setpiece_runtime.forum_closures (
 thread_id uuid PRIMARY KEY REFERENCES public.forum_threads(id) ON DELETE CASCADE,
 finalized_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reply_id uuid REFERENCES public.forum_replies(id) ON DELETE SET NULL,
 author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
ALTER TABLE setpiece_runtime.forum_closures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON setpiece_runtime.forum_closures FROM PUBLIC;
-- Respect preexisting MVP awards, including threads an administrator reopened.
INSERT INTO setpiece_runtime.forum_closures(thread_id,reply_id,author_id)
SELECT DISTINCT ON(thread_id) thread_id,id,author_id
FROM public.forum_replies WHERE is_mvp ORDER BY thread_id,created_at,id;
-- Enforce new parent links immediately; audit legacy violations before VALIDATE.
ALTER TABLE public.forum_replies ADD CONSTRAINT forum_reply_thread_identity UNIQUE(id,thread_id);
ALTER TABLE public.forum_replies ADD CONSTRAINT forum_reply_parent_same_thread
 FOREIGN KEY(parent_reply_id,thread_id) REFERENCES public.forum_replies(id,thread_id)
 ON DELETE CASCADE NOT VALID;
COMMIT;
