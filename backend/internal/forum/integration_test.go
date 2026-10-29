package forum_test

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/GajapriyanV/SetPiece/backend/internal/application"
	"github.com/GajapriyanV/SetPiece/backend/internal/auth"
	"github.com/GajapriyanV/SetPiece/backend/internal/config"
	"github.com/GajapriyanV/SetPiece/backend/internal/forum"
	"github.com/GajapriyanV/SetPiece/backend/internal/httpapi"
	"github.com/GajapriyanV/SetPiece/backend/internal/notifications"
	"github.com/GajapriyanV/SetPiece/backend/internal/support"
	"github.com/jackc/pgx/v5/pgxpool"
	"io"
	"log/slog"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

//go:embed testdata/schema.sql
var schema string

//go:embed testdata/0003_forum_closures.sql
var migration string

const owner = "11111111-1111-4111-8111-111111111111"
const member = "22222222-2222-4222-8222-222222222222"
const adminID = "33333333-3333-4333-8333-333333333333"
const other = "44444444-4444-4444-8444-444444444444"

type verifier struct{}

func (verifier) Verify(_ context.Context, token string) (auth.Identity, error) {
	if !application.ID(token) {
		return auth.Identity{}, auth.ErrUnauthorized
	}
	return auth.Identity{ID: token}, nil
}
func object(t *testing.T, b json.RawMessage) map[string]any {
	t.Helper()
	var v map[string]any
	if e := json.Unmarshal(b, &v); e != nil {
		t.Fatal(e)
	}
	return v
}
func TestCommunityPostgres(t *testing.T) {
	uri := os.Getenv("SETPIECE_COMMUNITY_TEST_DATABASE_URL")
	if uri == "" {
		t.Skip("isolated community fixture not configured")
	}
	u, e := url.Parse(uri)
	if e != nil || u.Hostname() != "127.0.0.1" || !strings.HasPrefix(strings.TrimPrefix(u.Path, "/"), "setpiece_m4_test_") || len(u.Query()) != 1 || u.Query().Get("sslmode") != "disable" {
		t.Fatal("requires a fresh loopback setpiece_m4_test_* database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	cfg, e := pgxpool.ParseConfig(uri)
	if e != nil {
		t.Fatal("fixture configuration failed")
	}
	cfg.MaxConns = 8
	pool, e := pgxpool.NewWithConfig(ctx, cfg)
	if e != nil {
		t.Fatal("fixture unavailable")
	}
	defer pool.Close()
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, e := pool.Exec(ctx, sql, args...); e != nil {
			t.Fatal(e)
		}
	}
	scalar := func(sql string, args ...any) int {
		t.Helper()
		var v int
		if e := pool.QueryRow(ctx, sql, args...).Scan(&v); e != nil {
			t.Fatal(e)
		}
		return v
	}
	if scalar("SELECT count(*) FROM pg_tables WHERE schemaname='public'") != 0 {
		t.Fatal("fixture database must be empty")
	}
	exec(schema)
	exec(`INSERT INTO public.forum_threads(id,title,body,flair) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Legacy A','Fixture','General'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Legacy B','Fixture','General');
 INSERT INTO public.forum_replies(id,thread_id,body) VALUES('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Legacy parent');
 INSERT INTO public.forum_replies(id,thread_id,parent_reply_id,body) VALUES('dddddddd-dddd-4ddd-8ddd-dddddddddddd','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','Legacy invalid child');`)
	exec(migration)
	for i, id := range []string{owner, member, adminID, other} {
		exec("INSERT INTO auth.users(id,email) VALUES($1,$2)", id, fmt.Sprintf("fixture%d@example.invalid", i))
		exec("INSERT INTO public.profiles(id,username,name,is_admin) VALUES($1,$2,$3,$4)", id, fmt.Sprintf("fixture%d", i), fmt.Sprintf("Player %d", i), id == adminID)
	}
	store := application.Store{Pool: pool, Writable: true}
	fs := &forum.Service{Store: store}
	ns := &notifications.Service{Store: store}
	ss := &support.Service{Store: store}
	handler := httpapi.New(httpapi.Dependencies{Auth: verifier{}, Forum: fs, Notifications: ns, Support: ss, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	request := func(method, path, user, body string) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		if user != "" {
			r.Header.Set("Authorization", "Bearer "+user)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	create := func(author string) string {
		t.Helper()
		b, e := fs.Create(ctx, author, forum.NewThread{Title: "Fixture", Body: "Discussion", Flair: "General"})
		if e != nil {
			t.Fatal(e)
		}
		return object(t, b)["id"].(string)
	}
	reply := func(thread, user string, parent *string) string {
		t.Helper()
		b, e := fs.Reply(ctx, user, thread, forum.NewReply{Body: "Reply", Parent: parent})
		if e != nil {
			t.Fatal(e)
		}
		return object(t, b)["reply"].(map[string]any)["id"].(string)
	}
	t.Run("legacy cross-thread deletion and new database parent constraint", func(t *testing.T) {
		exec("UPDATE public.forum_threads SET author_id=$1 WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'", owner)
		if _, e := fs.Delete(ctx, owner, "thread", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"); !errors.Is(e, application.ErrInvalid) {
			t.Fatal("legacy cross-thread cascade allowed", e)
		}
		if scalar("SELECT count(*) FROM public.forum_replies WHERE id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'") != 1 {
			t.Fatal("foreign child deleted")
		}
		if _, e := pool.Exec(ctx, "INSERT INTO public.forum_replies(thread_id,parent_reply_id,body) VALUES('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','New invalid child')"); e == nil {
			t.Fatal("new cross-thread link bypassed database constraint")
		}
	})
	t.Run("concurrent distinct users share one unread like notification", func(t *testing.T) {
		thread := create(owner)
		var wg sync.WaitGroup
		errs := make(chan error, 3)
		for _, id := range []string{member, other, adminID} {
			wg.Add(1)
			go func(id string) { defer wg.Done(); _, e := fs.Like(ctx, id, "thread", thread, true); errs <- e }(id)
		}
		wg.Wait()
		close(errs)
		for e := range errs {
			if e != nil {
				t.Fatal(e)
			}
		}
		if scalar("SELECT upvotes_count FROM public.forum_threads WHERE id=$1", thread) != 3 {
			t.Fatal("lost concurrent like")
		}
		if scalar("SELECT count(*) FROM public.notifications WHERE thread_id=$1 AND type='thread_like'", thread) != 1 {
			t.Fatal("duplicate unread aggregation")
		}
		if scalar("SELECT sum(count)::int FROM public.notifications WHERE thread_id=$1 AND type='thread_like'", thread) != 3 {
			t.Fatal("lost notification count")
		}
	})
	t.Run("explicit permissions and private data", func(t *testing.T) {
		for _, tc := range []struct{ method, path, body string }{{"POST", "/api/forum", `{"title":"X","body":"Y","flair":"General"}`}, {"POST", "/api/contact", `{"subject":"X","message":"Y"}`}, {"GET", "/api/notifications", ""}, {"GET", "/api/admin/reports", ""}, {"GET", "/api/admin/contact", ""}} {
			if w := request(tc.method, tc.path, "", tc.body); w.Code != 401 {
				t.Fatalf("%s anonymous=%d", tc.path, w.Code)
			}
		}
		for _, path := range []string{"/api/admin/reports", "/api/admin/contact"} {
			if w := request("GET", path, member, ""); w.Code != 403 {
				t.Fatalf("member admin access=%d", w.Code)
			}
		}
		for _, body := range []string{`{"title":"X","body":"Y","flair":"General","author_id":"` + owner + `"}`, `{"title":"X","body":"Y","flair":"General","upvotes_count":99}`} {
			if w := request("POST", "/api/forum", member, body); w.Code != 400 {
				t.Fatal("protected fields accepted")
			}
		}
		if _, e := fs.Create(ctx, member, forum.NewThread{Title: "X", Body: "Y", Flair: "General", Featured: true}); !errors.Is(e, application.ErrForbidden) {
			t.Fatal("nonadmin featured")
		}
		id := create(owner)
		if _, e := fs.Delete(ctx, member, "thread", id); !errors.Is(e, application.ErrForbidden) {
			t.Fatal("nonowner delete", e)
		}
		value := true
		if _, e := fs.Update(ctx, member, id, forum.Patch{Featured: &value}); !errors.Is(e, application.ErrForbidden) {
			t.Fatal("nonadmin update")
		}
		if _, e := fs.Update(ctx, adminID, id, forum.Patch{Featured: &value}); e != nil {
			t.Fatal(e)
		}
		if w := request("GET", "/api/forum", "", ""); w.Code != 200 {
			t.Fatal(w.Body.String())
		}
		if w := request("GET", "/api/forum/"+id, "", ""); w.Code != 200 {
			t.Fatal(w.Body.String())
		}
		if _, e := fs.Delete(ctx, adminID, "thread", id); e != nil {
			t.Fatal(e)
		}
	})
	t.Run("parent consistency depth triggers and paginated replies", func(t *testing.T) {
		thread := create(owner)
		foreign := create(other)
		parent := reply(foreign, other, nil)
		if _, e := fs.Reply(ctx, member, thread, forum.NewReply{Body: "Wrong parent", Parent: &parent}); !errors.Is(e, application.ErrInvalid) {
			t.Fatal("cross-thread parent", e)
		}
		top := reply(thread, member, nil)
		current := top
		for depth := 2; depth <= 20; depth++ {
			current = reply(thread, member, &current)
		}
		if _, e := fs.Reply(ctx, member, thread, forum.NewReply{Body: "Too deep", Parent: &current}); !errors.Is(e, application.ErrInvalid) {
			t.Fatal("depth bound", e)
		}
		for i := 0; i < 15; i++ {
			reply(thread, member, nil)
		}
		if n := scalar("SELECT reply_count FROM public.forum_threads WHERE id=$1", thread); n != 35 {
			t.Fatalf("counter=%d", n)
		}
		if n := scalar("SELECT count(*) FROM public.notifications WHERE thread_id=$1 AND type='thread_reply'", thread); n != 16 {
			t.Fatalf("notification count=%d", n)
		}
		first, e := fs.Detail(ctx, member, thread, 1)
		if e != nil {
			t.Fatal(e)
		}
		v := object(t, first)
		if len(v["replyRows"].([]any)) != 30 || v["nextReplyPage"] != float64(2) {
			t.Fatal("first page")
		}
		last, e := fs.Detail(ctx, member, thread, 2)
		if e != nil {
			t.Fatal(e)
		}
		v = object(t, last)
		if len(v["replyRows"].([]any)) != 5 || v["nextReplyPage"] != nil {
			t.Fatal("last page")
		}
		if _, e := fs.Delete(ctx, member, "reply", top); e != nil {
			t.Fatal(e)
		}
		if n := scalar("SELECT reply_count FROM public.forum_threads WHERE id=$1", thread); n != 15 {
			t.Fatal("cascade counts", n)
		}
	})
	t.Run("concurrent idempotent likes preserve trigger totals and notifications", func(t *testing.T) {
		thread := create(owner)
		target := reply(thread, member, nil)
		run := func(liked bool) {
			var wg sync.WaitGroup
			errs := make(chan error, 20)
			for i := 0; i < 20; i++ {
				wg.Add(1)
				go func() { defer wg.Done(); _, e := fs.Like(ctx, other, "reply", target, liked); errs <- e }()
			}
			wg.Wait()
			close(errs)
			for e := range errs {
				if e != nil {
					t.Fatal(e)
				}
			}
		}
		before := scalar("SELECT upvotes_received FROM public.profiles WHERE id=$1", member)
		run(true)
		if n := scalar("SELECT upvotes_count FROM public.forum_replies WHERE id=$1", target); n != 1 {
			t.Fatal("duplicate increments", n)
		}
		if n := scalar("SELECT upvotes_received FROM public.profiles WHERE id=$1", member); n != before+1 {
			t.Fatal("received counter", n)
		}
		if n := scalar("SELECT sum(count)::int FROM public.notifications WHERE reply_id=$1 AND type='reply_like'", target); n != 1 {
			t.Fatal("duplicate notification", n)
		}
		run(false)
		if n := scalar("SELECT upvotes_count FROM public.forum_replies WHERE id=$1", target); n != 0 {
			t.Fatal(n)
		}
		if n := scalar("SELECT count(*) FROM public.notifications WHERE reply_id=$1 AND type='reply_like'", target); n != 0 {
			t.Fatal("unlike notification", n)
		}
		if _, e := fs.Like(ctx, other, "reply", target, true); e != nil {
			t.Fatal(e)
		}
		if _, e := fs.Delete(ctx, owner, "thread", thread); e != nil {
			t.Fatal(e)
		}
		if n := scalar("SELECT count(*) FROM public.forum_likes WHERE target_id=$1", target); n != 0 {
			t.Fatal("orphan likes")
		}
		if n := scalar("SELECT upvotes_received FROM public.profiles WHERE id=$1", member); n != before {
			t.Fatal("delete failed to reconcile received upvotes")
		}
	})
	t.Run("MVP closure once across concurrency reopen and rollback", func(t *testing.T) {
		thread := create(owner)
		target := reply(thread, member, nil)
		reply(thread, other, nil)
		if _, e := fs.Like(ctx, other, "reply", target, true); e != nil {
			t.Fatal(e)
		}
		before := scalar("SELECT mvp_count FROM public.profiles WHERE id=$1", member)
		exec("UPDATE public.forum_threads SET closes_at=clock_timestamp()-interval '1 second' WHERE id=$1", thread)
		var wg sync.WaitGroup
		errs := make(chan error, 16)
		for i := 0; i < 16; i++ {
			wg.Add(1)
			go func() { defer wg.Done(); _, e := fs.Detail(ctx, "", thread, 1); errs <- e }()
		}
		wg.Wait()
		close(errs)
		for e := range errs {
			if e != nil {
				t.Fatal(e)
			}
		}
		if n := scalar("SELECT mvp_count FROM public.profiles WHERE id=$1", member); n != before+1 {
			t.Fatal("MVP repeated", n)
		}
		if n := scalar("SELECT count(*) FROM public.notifications WHERE thread_id=$1 AND type='mvp_awarded'", thread); n != 1 {
			t.Fatal("MVP notification repeated")
		}
		if _, e := fs.Reply(ctx, member, thread, forum.NewReply{Body: "Late"}); !errors.Is(e, application.ErrClosed) {
			t.Fatal("closed reply")
		}
		reopen := false
		if _, e := fs.Update(ctx, adminID, thread, forum.Patch{Closed: &reopen}); e != nil {
			t.Fatal(e)
		}
		if _, e := fs.Detail(ctx, "", thread, 1); e != nil {
			t.Fatal(e)
		}
		if n := scalar("SELECT mvp_count FROM public.profiles WHERE id=$1", member); n != before+1 {
			t.Fatal("reopen awarded again")
		}
		if _, e := fs.Like(ctx, owner, "reply", target, true); e != nil {
			t.Fatal("legacy closed likes not preserved", e)
		}
		failed := create(owner)
		reply(failed, member, nil)
		exec("UPDATE public.forum_threads SET closes_at=clock_timestamp()-interval '1 second' WHERE id=$1", failed)
		exec(`CREATE FUNCTION public.fail_mvp_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type='mvp_awarded' THEN RAISE EXCEPTION 'fixture'; END IF;RETURN NEW;END $$;
 CREATE TRIGGER fail_mvp_fixture BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.fail_mvp_fixture()`)
		if _, e := fs.Detail(ctx, "", failed, 1); e == nil {
			t.Fatal("injected error not returned")
		}
		if n := scalar("SELECT count(*) FROM setpiece_runtime.forum_closures WHERE thread_id=$1", failed); n != 0 {
			t.Fatal("uncommitted ledger")
		}
		if n := scalar("SELECT mvp_count FROM public.profiles WHERE id=$1", member); n != before+1 {
			t.Fatal("uncommitted counter")
		}
		exec("DROP TRIGGER fail_mvp_fixture ON public.notifications")
		if _, e := fs.Detail(ctx, "", failed, 1); e != nil {
			t.Fatal(e)
		}
	})
	t.Run("recipient isolation reports and private support", func(t *testing.T) {
		thread := create(owner)
		target := reply(thread, member, nil)
		var notification string
		if e := pool.QueryRow(ctx, "SELECT id::text FROM public.notifications WHERE thread_id=$1 LIMIT 1", thread).Scan(&notification); e != nil {
			t.Fatal(e)
		}
		if _, e := ns.Read(ctx, other, notification); e != nil {
			t.Fatal(e)
		}
		if scalar("SELECT count(*) FROM public.notifications WHERE id=$1 AND is_read=false", notification) != 1 {
			t.Fatal("cross-recipient read")
		}
		if _, e := ns.Read(ctx, owner, notification); e != nil {
			t.Fatal(e)
		}
		if scalar("SELECT count(*) FROM public.notifications WHERE id=$1 AND is_read=true", notification) != 1 {
			t.Fatal("recipient read")
		}
		if _, e := ns.List(ctx, owner); e != nil {
			t.Fatal(e)
		}
		if _, e := fs.Report(ctx, other, forum.Report{Type: "reply", ID: target, Reason: "Spam"}); e != nil {
			t.Fatal(e)
		}
		reports, e := fs.Reports(ctx, adminID, "all")
		if e != nil {
			t.Fatal(e)
		}
		report := object(t, reports)["reports"].([]any)[0].(map[string]any)
		if report["thread_id"] != thread {
			t.Fatal("report thread link")
		}
		rid := report["id"].(string)
		if _, e := fs.Review(ctx, member, rid); !errors.Is(e, application.ErrForbidden) {
			t.Fatal("member review")
		}
		if _, e := fs.Review(ctx, adminID, rid); e != nil {
			t.Fatal(e)
		}
		if _, e := ss.Create(ctx, member, support.Ticket{Subject: "Help", Message: "Fixture only"}); e != nil {
			t.Fatal(e)
		}
		if _, e := ss.List(ctx, member, "all"); !errors.Is(e, application.ErrForbidden) {
			t.Fatal("private support leaked")
		}
		tickets, e := ss.List(ctx, adminID, "all")
		if e != nil {
			t.Fatal(e)
		}
		ticket := object(t, tickets)["tickets"].([]any)[0].(map[string]any)
		if ticket["email"] != "fixture1@example.invalid" || ticket["name"] != "Player 1" {
			t.Fatal("noncanonical contact identity")
		}
		if _, e := ss.Review(ctx, adminID, ticket["id"].(string)); e != nil {
			t.Fatal(e)
		}
		if w := request("POST", "/api/contact", member, `{"subject":"X","message":"Y","email":"forged"}`); w.Code != 400 {
			t.Fatal("contact forgery")
		}
		readonly := &forum.Service{Store: application.Store{Pool: pool}}
		if _, e := readonly.Create(ctx, member, forum.NewThread{Title: "X", Body: "Y", Flair: "General"}); !errors.Is(e, application.ErrReadOnly) {
			t.Fatal("unguarded write")
		}
	})
}
func TestCommunityConfiguration(t *testing.T) {
	for _, tc := range []struct {
		community, profile, environment string
		valid                           bool
	}{
		{"postgresql://fixture@127.0.0.1/setpiece_m4_test_x?sslmode=disable", "", "development", true},
		{"postgresql://fixture@remote.example/setpiece_m4_test_x?sslmode=disable", "", "development", false},
		{"postgresql://fixture@127.0.0.1/postgres?sslmode=disable", "", "development", false},
		{"postgresql://fixture@127.0.0.1/setpiece_m4_test_x?sslmode=disable", "postgresql://fixture@127.0.0.1/setpiece_m4_test_y?sslmode=disable", "development", false},
		{"postgresql://fixture@127.0.0.1/setpiece_m4_test_x?sslmode=disable", "", "production", false},
	} {
		_, e := config.Load(func(k string) string {
			switch k {
			case "SUPABASE_URL":
				return "https://fixture.supabase.co"
			case "COMMUNITY_DATABASE_URL":
				return tc.community
			case "PROFILE_DATABASE_URL":
				return tc.profile
			case "APP_ENV":
				return tc.environment
			}
			return ""
		})
		if (e == nil) != tc.valid {
			t.Fatalf("configuration allowed=%v want %v", e == nil, tc.valid)
		}
	}
}
