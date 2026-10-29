package development

import (
	"context"
	"encoding/json"
	"github.com/GajapriyanV/SetPiece/backend/internal/application"
	"github.com/GajapriyanV/SetPiece/backend/internal/auth"
	"github.com/GajapriyanV/SetPiece/backend/internal/ownership"
	"github.com/GajapriyanV/SetPiece/backend/internal/support"
	"github.com/GajapriyanV/SetPiece/backend/internal/users"
	"github.com/GajapriyanV/SetPiece/backend/migrations"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"
)

// Only an operator-created local restore is accepted. Never loads .env or inserts users.
func TestRestoredDevelopmentDatabase(t *testing.T) {
	raw := os.Getenv("SETPIECE_DEVELOPMENT_RESTORE_TEST_URL")
	if raw == "" {
		t.Skip("local restored development database not configured")
	}
	u, e := url.Parse(raw)
	if e != nil || u.Scheme != "postgresql" || u.Hostname() != "127.0.0.1" || u.Port() != "55439" || u.Path != "/setpiece_m5_test_restore" || u.RawQuery != "sslmode=disable" || u.User == nil || u.User.Username() != "postgres" {
		t.Fatal("refusing non-local restore test database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	pool, e := pgxpool.New(ctx, raw)
	if e != nil {
		t.Fatal("local restore connection failed")
	}
	defer pool.Close()
	var count int
	if e = pool.QueryRow(ctx, "SELECT count(*) FROM pg_namespace WHERE nspname='setpiece_runtime'").Scan(&count); e != nil || count != 0 {
		t.Fatal("requires an unmigrated restore")
	}
	fingerprint := func() map[string]string {
		t.Helper()
		result := map[string]string{}
		for _, table := range []string{"profiles", "debates", "votes", "chat_messages", "forum_threads", "forum_replies", "forum_likes", "forum_reports", "notifications", "contact_tickets"} {
			var hash string
			if e := pool.QueryRow(ctx, "SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public."+pgx.Identifier{table}.Sanitize()+" t").Scan(&hash); e != nil {
				t.Fatal("fingerprint failed", table)
			}
			result[table] = hash
		}
		return result
	}
	before := fingerprint()
	if e = migrations.Apply(ctx, pool); e != nil {
		t.Fatal(e)
	}
	password := strings.Repeat("fixture'quote-", 4)
	if e = InstallRole(ctx, pool, password); e != nil {
		t.Fatal(e)
	}
	for table, hash := range fingerprint() {
		if hash != before[table] {
			t.Fatal("migration changed existing data", table)
		}
	}
	if e = migrations.Apply(ctx, pool); e != nil {
		t.Fatal("migration rerun failed", e)
	}
	if e = InstallRole(ctx, pool, password); e == nil {
		t.Fatal("existing role silently overwritten")
	}
	for _, role := range []string{"anon", "authenticated", "service_role"} {
		var bypass bool
		e = pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND
 (has_table_privilege($1,format('%I.%I',schemaname,tablename),'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege($1,format('%I.%I',schemaname,tablename),'INSERT,UPDATE,REFERENCES')))`, role).Scan(&bypass)
		if e != nil || bypass {
			t.Fatal("legacy mutation privilege remains", role)
		}
		for _, s := range []string{"SELECT public.close_thread_if_expired('00000000-0000-4000-8000-000000000001')", "SELECT * FROM setpiece_runtime.contact_identities"} {
			tx, e := pool.Begin(ctx)
			if e != nil {
				t.Fatal(e)
			}
			_, e = tx.Exec(ctx, "SET LOCAL ROLE "+pgx.Identifier{role}.Sanitize())
			if e == nil {
				_, e = tx.Exec(ctx, s)
			}
			_ = tx.Rollback(ctx)
			if pg, ok := e.(interface{ SQLState() string }); !ok || pg.SQLState() != "42501" {
				t.Fatal("expected permission denial", role)
			}
		}
	}
	u.User = url.UserPassword("setpiece_app", password)
	runtime, e := pgxpool.New(ctx, u.String())
	if e != nil {
		t.Fatal("runtime config failed")
	}
	defer runtime.Close()
	var id string
	if e = runtime.QueryRow(ctx, "SELECT id::text FROM public.profiles ORDER BY id LIMIT 1").Scan(&id); e != nil {
		t.Fatal("runtime profile read failed")
	}
	a := users.Account{Pool: runtime, Writable: true, Location: time.UTC}
	if _, e = a.ReadProfile(ctx, auth.Identity{ID: id}); e != nil {
		t.Fatal("canonical profile read failed", e)
	}
	for _, s := range []string{"UPDATE public.profiles SET is_admin=true", "DELETE FROM public.profiles", "SELECT * FROM auth.users", "SELECT * FROM setpiece_migrations.applied", "CREATE TABLE public.unexpected(id int)"} {
		tx, e := runtime.Begin(ctx)
		if e != nil {
			t.Fatal(e)
		}
		_, e = tx.Exec(ctx, s)
		_ = tx.Rollback(ctx)
		if pg, ok := e.(interface{ SQLState() string }); !ok || pg.SQLState() != "42501" {
			t.Fatal("runtime scope too broad")
		}
	}
	lease, e := ownership.Acquire(ctx, runtime)
	if e != nil {
		t.Fatal("restricted ownership failed", e)
	}
	lease.Close()
	s := support.Service{Store: application.Store{Pool: runtime, Writable: true}, PrivateContactView: true}
	if _, e = s.Create(ctx, id, support.Ticket{Subject: "Local restore verification", Message: "Written only to the disposable restore."}); e != nil {
		t.Fatal("private contact projection failed", e)
	}
	// Check all three trigger owners can maintain counters after client EXECUTE is removed.
	tx, e := runtime.Begin(ctx)
	if e != nil {
		t.Fatal(e)
	}
	defer tx.Rollback(ctx)
	var other string
	if e = runtime.QueryRow(ctx, "SELECT id::text FROM public.profiles WHERE id<>$1 ORDER BY id LIMIT 1", id).Scan(&other); e != nil {
		t.Fatal("requires two restored profiles")
	}
	var thread, reply string
	if e = tx.QueryRow(ctx, "INSERT INTO public.forum_threads(author_id,title,body,flair) VALUES($1,'Local fixture','Local fixture','General') RETURNING id::text", other).Scan(&thread); e != nil {
		t.Fatal("thread insert failed", e)
	}
	if e = tx.QueryRow(ctx, "INSERT INTO public.forum_replies(thread_id,author_id,body) VALUES($1,$2,'Local fixture') RETURNING id::text", thread, id).Scan(&reply); e != nil {
		t.Fatal("reply triggers failed", e)
	}
	if _, e = tx.Exec(ctx, "INSERT INTO public.forum_likes(user_id,target_type,target_id) VALUES($1,'reply',$2)", id, reply); e != nil {
		t.Fatal("like triggers failed", e)
	}
	var n int
	if e = tx.QueryRow(ctx, "SELECT upvotes_count FROM public.forum_replies WHERE id=$1", reply).Scan(&n); e != nil || n != 1 {
		t.Fatal("like trigger result invalid", e)
	}
	if e = tx.QueryRow(ctx, "SELECT reply_count FROM public.forum_threads WHERE id=$1", thread).Scan(&n); e != nil || n != 1 {
		t.Fatal("reply counter invalid")
	}
	if e = tx.QueryRow(ctx, "SELECT count(*) FROM public.notifications WHERE user_id=$1 AND reply_id=$2", other, reply).Scan(&n); e != nil || n != 1 {
		t.Fatal("notification trigger invalid")
	}
	b, _ := json.Marshal(map[string]bool{"existing_public_rows_preserved": true, "restricted_role": true, "profile_contact_triggers": true})
	t.Log(string(b))
}
