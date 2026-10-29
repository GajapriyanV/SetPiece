// inspectdb exports schema metadata only. It never selects user rows or runs DDL.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/GajapriyanV/SetPiece/backend/internal/config"
	"github.com/GajapriyanV/SetPiece/backend/internal/database"
)

func main() {
	envFile := flag.String("env-file", ".env", "local environment file; empty disables loading")
	flag.Parse()
	if err := config.LoadEnvFile(*envFile); err != nil {
		fail(err.Error())
	}
	uri := os.Getenv("DATABASE_URL")
	if uri == "" {
		fail("DATABASE_URL is required; use the existing Supabase database connection URI")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	pool, err := database.Open(ctx, uri, 1, 3*time.Second)
	if err != nil {
		fail("invalid database connection configuration")
	}
	defer pool.Close()
	var result []byte
	if err = pool.QueryRow(ctx, schemaQuery).Scan(&result); err != nil {
		fail("schema inspection failed; check connectivity and metadata permissions (credentials omitted)")
	}
	var document any
	if json.Unmarshal(result, &document) != nil {
		fail("invalid schema response")
	}
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	if encoder.Encode(document) != nil {
		fail("could not write schema output")
	}
}
func fail(message string) { fmt.Fprintln(os.Stderr, message); os.Exit(1) }

const schemaQuery = `
SELECT jsonb_build_object(
  'functions', (SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.proname,'definition',pg_get_functiondef(p.oid))),'[]'::jsonb) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')),
  'notification_publications', (SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) FROM pg_publication_tables p WHERE schemaname='public' AND tablename='notifications'),
  'avatar_bucket', (SELECT to_jsonb(b) FROM (SELECT id,public,file_size_limit,allowed_mime_types FROM storage.buckets WHERE id='avatars') b),
  'storage_policies', (SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) FROM pg_policies p WHERE schemaname='storage' AND tablename IN ('objects','buckets')),
  'auth_triggers', (SELECT coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'function',pg_get_functiondef(t.tgfoid))),'[]'::jsonb) FROM pg_trigger t WHERE t.tgrelid='auth.users'::regclass AND NOT t.tgisinternal),
  'runtime_namespace_exists', EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='setpiece_runtime'),
  'public_tables', (SELECT coalesce(jsonb_agg(tablename),'[]'::jsonb) FROM pg_tables WHERE schemaname='public'),
  'columns', (
    SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.table_schema,c.table_name,c.ordinal_position),'[]'::jsonb)
    FROM (
      SELECT table_schema,table_name,column_name,ordinal_position,data_type,udt_schema,udt_name,is_nullable,column_default
      FROM information_schema.columns
      WHERE (table_schema='public' AND table_name IN ('profiles','debates','votes','chat_messages','forum_threads','forum_replies','forum_likes','forum_reports','notifications','contact_tickets'))
         OR (table_schema='auth' AND table_name='users')
    ) c
  ),
  'constraints', (
    SELECT coalesce(jsonb_agg(jsonb_build_object('table',r.relname,'name',c.conname,'definition',pg_get_constraintdef(c.oid))),'[]'::jsonb)
    FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname IN ('profiles','debates','votes','chat_messages','forum_threads','forum_replies','forum_likes','forum_reports','notifications','contact_tickets')
  ),
  'indexes', (
    SELECT coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) FROM pg_indexes i
    WHERE schemaname='public' AND tablename IN ('profiles','debates','votes','chat_messages','forum_threads','forum_replies','forum_likes','forum_reports','notifications','contact_tickets')
  ),
  'rls', (
    SELECT coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'enabled',c.relrowsecurity,'forced',c.relforcerowsecurity)),'[]'::jsonb)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN ('profiles','debates','votes','chat_messages','forum_threads','forum_replies','forum_likes','forum_reports','notifications','contact_tickets')
  ),
  'policies', (
    SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) FROM pg_policies p
    WHERE schemaname='public' AND tablename IN ('profiles','debates','votes','chat_messages','forum_threads','forum_replies','forum_likes','forum_reports','notifications','contact_tickets')
  ),
  'grants', (
    SELECT coalesce(jsonb_agg(to_jsonb(g)),'[]'::jsonb) FROM information_schema.table_privileges g
    WHERE table_schema='public' AND table_name IN ('profiles','debates','votes','chat_messages','forum_threads','forum_replies','forum_likes','forum_reports','notifications','contact_tickets')
  ),
  'triggers', (
    SELECT coalesce(jsonb_agg(jsonb_build_object('table',r.relname,'name',t.tgname,'definition',pg_get_triggerdef(t.oid),
      'function',pg_get_functiondef(t.tgfoid))),'[]'::jsonb)
    FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE NOT t.tgisinternal AND n.nspname='public' AND r.relname IN ('profiles','debates','votes','chat_messages','forum_threads','forum_replies','forum_likes','forum_reports','notifications','contact_tickets')
  ),
  'connection_role', (
    SELECT jsonb_build_object('name',rolname,'superuser',rolsuper,'bypass_rls',rolbypassrls)
    FROM pg_roles WHERE rolname=current_user
  )
)
`
