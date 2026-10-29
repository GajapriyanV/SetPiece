-- SYNTHETIC REHEARSAL ONLY, not an automatic/production migration.
-- Run as the fixture owner after migrations, before starting the app.
BEGIN;
DO $$ BEGIN
 IF current_database() !~ '^setpiece_m5_test_[a-z0-9_]+$'
    OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION 'requires a disposable loopback rehearsal database';
 END IF;
END $$;
CREATE ROLE setpiece_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated, setpiece_app;
GRANT USAGE ON SCHEMA public, auth, setpiece_runtime TO setpiece_app;
GRANT SELECT (id,email,created_at) ON auth.users TO setpiece_app;

-- Remove both table AND column grants: revoking table UPDATE alone does not
-- remove pre-existing UPDATE(column) privileges. Retain SELECT/RLS for clients.
DO $$ DECLARE t text; cols text; BEGIN
 FOREACH t IN ARRAY ARRAY['profiles','debates','votes','forum_threads','forum_replies',
                         'forum_likes','forum_reports','notifications','contact_tickets'] LOOP
  EXECUTE format('REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.%I FROM PUBLIC,anon,authenticated',t);
  SELECT string_agg(quote_ident(attname),',') INTO cols FROM pg_attribute
   WHERE attrelid=format('public.%I',t)::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE INSERT(%s),UPDATE(%s),REFERENCES(%s) ON public.%I FROM PUBLIC,anon,authenticated',cols,cols,cols,t);
  EXECUTE format('GRANT SELECT ON public.%I TO setpiece_app',t);
  EXECUTE format('CREATE POLICY setpiece_app_access ON public.%I TO setpiece_app USING(true) WITH CHECK(true)',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['rooms','members','debates','results','forum_closures','owner'] LOOP
  EXECUTE format('GRANT SELECT ON setpiece_runtime.%I TO setpiece_app',t);
  EXECUTE format('CREATE POLICY setpiece_app_access ON setpiece_runtime.%I TO setpiece_app USING(true) WITH CHECK(true)',t);
 END LOOP;
END $$;
GRANT INSERT(id) ON public.profiles TO setpiece_app;
GRANT UPDATE(name,username,country,club,avatar_url,updated_at,username_changed_at,registration_complete,
             elo,wins,losses,draws,debates_count,mvp_count) ON public.profiles TO setpiece_app;
GRANT INSERT ON public.debates,public.votes TO setpiece_app;
GRANT UPDATE(status,finished_at,winner_id,result,votes_a,votes_b,elo_change) ON public.debates TO setpiece_app;
GRANT INSERT(author_id,title,body,flair,is_featured),UPDATE(is_featured,is_closed),DELETE ON public.forum_threads TO setpiece_app;
GRANT INSERT(thread_id,author_id,body,parent_reply_id),UPDATE(is_mvp),DELETE ON public.forum_replies TO setpiece_app;
GRANT INSERT(user_id,target_type,target_id),DELETE ON public.forum_likes TO setpiece_app;
GRANT INSERT(reporter_id,target_type,target_id,reason,custom_reason),UPDATE(is_reviewed) ON public.forum_reports TO setpiece_app;
GRANT INSERT(user_id,type,thread_id,reply_id,actor_id),UPDATE(is_read) ON public.notifications TO setpiece_app;
GRANT INSERT(user_id,name,email,subject,message),UPDATE(is_reviewed) ON public.contact_tickets TO setpiece_app;
GRANT INSERT,UPDATE ON setpiece_runtime.rooms,setpiece_runtime.debates TO setpiece_app;
GRANT INSERT,DELETE ON setpiece_runtime.members TO setpiece_app;
GRANT INSERT ON setpiece_runtime.results,setpiece_runtime.forum_closures TO setpiece_app;
GRANT UPDATE(token) ON setpiece_runtime.owner TO setpiece_app;

REVOKE ALL ON FUNCTION public.close_thread_if_expired(uuid) FROM PUBLIC,anon,authenticated,setpiece_app;
REVOKE ALL ON FUNCTION public.handle_forum_reply_change(),public.handle_new_reply_notification(),
 public.handle_forum_like_change() FROM PUBLIC,anon,authenticated,setpiece_app;
ALTER FUNCTION public.handle_forum_reply_change() SET search_path=pg_catalog,public,pg_temp;
ALTER FUNCTION public.handle_new_reply_notification() SET search_path=pg_catalog,public,pg_temp;
ALTER FUNCTION public.handle_forum_like_change() SET search_path=pg_catalog,public,pg_temp;
-- Auth/Storage/Realtime policies are intentionally outside this local candidate.
COMMIT;
