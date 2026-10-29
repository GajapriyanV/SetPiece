package users_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/GajapriyanV/SetPiece/backend/internal/auth"
	"github.com/GajapriyanV/SetPiece/backend/internal/config"
	"github.com/GajapriyanV/SetPiece/backend/internal/httpapi"
	"github.com/GajapriyanV/SetPiece/backend/internal/leaderboard"
	"github.com/GajapriyanV/SetPiece/backend/internal/users"
	"github.com/jackc/pgx/v5/pgxpool"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestAccountPostgres(t *testing.T) {
	uri := os.Getenv("SETPIECE_ACCOUNT_TEST_DATABASE_URL")
	if uri == "" {
		t.Skip("isolated account database not configured")
	}
	u, e := url.Parse(uri)
	if e != nil || u.Hostname() != "127.0.0.1" || !strings.HasPrefix(strings.TrimPrefix(u.Path, "/"), "setpiece_m4_test_") || u.Query().Get("sslmode") != "disable" || len(u.Query()) != 1 {
		t.Fatal("requires an isolated loopback setpiece_m4_test_* database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	pool, e := pgxpool.New(ctx, uri)
	if e != nil {
		t.Fatal("test pool unavailable")
	}
	defer pool.Close()
	var exists bool
	if e = pool.QueryRow(ctx, "SELECT to_regclass('public.profiles') IS NOT NULL").Scan(&exists); e != nil || exists {
		t.Fatal("requires empty database")
	}
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	exec(schemaSQL)
	exec("ALTER TABLE public.profiles ADD COLUMN is_admin boolean NOT NULL DEFAULT false, ADD COLUMN registration_complete boolean NOT NULL DEFAULT false")
	ids := []string{caller, other}
	for n := 3; n <= 45; n++ {
		ids = append(ids, fmt.Sprintf("00000000-0000-4000-8000-%012d", n))
	}
	for n, id := range ids {
		exec("INSERT INTO auth.users(id,created_at) VALUES($1,'2019-01-01')", id)
		exec(`INSERT INTO public.profiles(id,username,country,created_at,elo,wins,losses,draws,debates_count)
 VALUES($1,$2,CASE WHEN $3::int%3=0 THEN NULL ELSE 'Canada' END,
 CASE WHEN $3::int%5=0 THEN NULL ELSE '2020-01-01'::timestamptz END,1200+$3::int%4,$3::int%4,$3::int%3,0,$3::int%7)`, id, fmt.Sprintf("user%d", n), n)
	}
	exec(`INSERT INTO public.debates(room_code,topic,side_a_label,side_b_label,debater_a_id,debater_b_id,winner_id,status,result,finished_at,votes_a,votes_b)
 SELECT 'fixture','topic','A','B',$1,$2,$1,'finished','side_a','2026-01-01',2,1 FROM generate_series(1,1105)`, caller, other)
	// Excluded prior season and unfinished records must not affect seasonal counts.
	exec(`INSERT INTO public.debates(room_code,topic,side_a_label,side_b_label,debater_a_id,debater_b_id,winner_id,status,result,finished_at)
 VALUES('fixture','old','A','B',$1,$2,$2,'finished','side_b','2025-12-31 23:59:59+00'),
 ('fixture','live','A','B',$1,$2,$2,'live','side_b','2026-02-01')`, caller, other)
	a := &users.Account{Pool: pool, Writable: true, SupabaseURL: "https://fixture.supabase.co", Location: time.UTC}
	ranks := &leaderboard.Repository{Pool: pool}
	t.Run("every rank matches every paginated list", func(t *testing.T) {
		for _, kind := range []string{"ranked", "unranked"} {
			for _, period := range []string{"season", "alltime"} {
				for _, section := range []string{"global", "regional"} {
					f := leaderboard.Filter{Type: kind, Period: period, Section: section}
					for page := 1; page <= 4; page++ {
						f.Page = page
						raw, err := ranks.List(ctx, f, other)
						if err != nil {
							t.Fatal(err)
						}
						var list struct {
							Players []struct{ ID string }
							Total   int
						}
						if err = json.Unmarshal(raw, &list); err != nil {
							t.Fatal(err)
						}
						for n, p := range list.Players {
							raw, err = ranks.Me(ctx, f, p.ID)
							if err != nil {
								t.Fatal(err)
							}
							var me struct{ Rank int }
							_ = json.Unmarshal(raw, &me)
							if me.Rank != (page-1)*20+n+1 {
								t.Fatalf("%+v: rank %d at offset %d", f, me.Rank, (page-1)*20+n+1)
							}
						}
						if page == 4 && len(list.Players) != 0 {
							t.Fatal("out of range page must be empty")
						}
					}
				}
			}
		}
	})
	t.Run("season is not truncated and missing country is not global", func(t *testing.T) {
		f := leaderboard.Filter{Type: "unranked", Period: "season", Section: "global", Page: 1}
		raw, err := ranks.Me(ctx, f, caller)
		if err != nil {
			t.Fatal(err)
		}
		var me struct {
			Wins int
			Rank *int
		}
		_ = json.Unmarshal(raw, &me)
		if me.Wins != 1105 {
			t.Fatalf("season wins %d", me.Wins)
		}
		f.Section = "regional"
		raw, err = ranks.Me(ctx, f, caller)
		if err != nil {
			t.Fatal(err)
		}
		_ = json.Unmarshal(raw, &me)
		if me.Rank != nil {
			t.Fatal("missing country must have no regional rank")
		}
		raw, err = ranks.List(ctx, f, caller)
		if err != nil {
			t.Fatal(err)
		}
		var list struct{ Total int }
		_ = json.Unmarshal(raw, &list)
		if list.Total != 0 {
			t.Fatal("missing country list must be empty")
		}
	})
	t.Run("canonical public private ranks dates and statistics", func(t *testing.T) {
		p, err := a.ReadProfile(ctx, auth.Identity{ID: other})
		if err != nil {
			t.Fatal(err)
		}
		public, err := a.Public(ctx, "user1")
		if err != nil {
			t.Fatal(err)
		}
		if p.JoinDate != "Jan 2020" || public["joinDate"] != p.JoinDate || int64(public["rank"].(float64)) != p.Rank || len(p.Debates) != 20 {
			t.Fatalf("profile mismatch %+v", p)
		}
		if _, ok := public["is_admin"]; ok {
			t.Fatal("private admin leaked")
		}
		if _, ok := public["username_changed_at"]; ok {
			t.Fatal("private edit fields leaked")
		}
		raw, err := a.Stats(ctx)
		if err != nil {
			t.Fatal(err)
		}
		var stats struct {
			Votes int `json:"votesCastAllTime"`
		}
		_ = json.Unmarshal(raw, &stats)
		if stats.Votes != 3315 {
			t.Fatal("votes were truncated")
		}
	})
	t.Run("owned writes cooldown unique concurrency and rollback", func(t *testing.T) {
		country := "Canada"
		input := users.Edit{Name: "New name", Username: "renamed", Country: &country}
		_, err := a.Edit(ctx, auth.Identity{ID: caller}, input, false)
		if err != nil {
			t.Fatal(err)
		}
		_, err = a.Edit(ctx, auth.Identity{ID: caller}, input, false)
		if err != nil {
			t.Fatal("identical retry", err)
		}
		input.Username = "again"
		if _, err = a.Edit(ctx, auth.Identity{ID: caller}, input, false); !errors.Is(err, users.ErrCooldown) {
			t.Fatal("cooldown not enforced", err)
		}
		input.Username = "renamed"
		if _, err = a.Edit(ctx, auth.Identity{ID: other}, input, false); !errors.Is(err, users.ErrUsername) {
			t.Fatal("unique constraint not enforced", err)
		}
		input.Username = "race"
		results := make(chan error, 2)
		var wg sync.WaitGroup
		for _, id := range ids[2:4] {
			wg.Add(1)
			go func(id string) {
				defer wg.Done()
				_, err := a.Edit(ctx, auth.Identity{ID: id}, input, false)
				results <- err
			}(id)
		}
		wg.Wait()
		close(results)
		success, conflict := 0, 0
		for err := range results {
			if err == nil {
				success++
			} else if errors.Is(err, users.ErrUsername) {
				conflict++
			} else {
				t.Fatal(err)
			}
		}
		if success != 1 || conflict != 1 {
			t.Fatal("concurrent uniqueness")
		}
		exec(`CREATE FUNCTION public.reject_profile_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.name='rollback' THEN RAISE EXCEPTION 'test failure'; END IF; RETURN NEW; END $$;
 CREATE TRIGGER reject_profile_test BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.reject_profile_test()`)
		input.Username = "renamed"
		input.Name = "rollback"
		if _, err = a.Edit(ctx, auth.Identity{ID: caller}, input, false); err == nil {
			t.Fatal("failure not propagated")
		}
		raw, err := a.Self(ctx, auth.Identity{ID: caller})
		if err != nil {
			t.Fatal(err)
		}
		var me struct {
			Name string
			Elo  int
		}
		_ = json.Unmarshal(raw, &me)
		if me.Name != "New name" {
			t.Fatal("failed write was committed")
		}
	})
	t.Run("avatar directory and protected fields", func(t *testing.T) {
		for _, avatar := range []string{"https://evil.example/a.png", "https://fixture.supabase.co/storage/v1/object/public/avatars/" + other + "/a.png", "https://fixture.supabase.co/storage/v1/object/public/avatars/" + caller + "/%2e%2e/a.png"} {
			_, err := a.Edit(ctx, auth.Identity{ID: caller}, users.Edit{Name: "New name", Username: "renamed", AvatarURL: &avatar}, false)
			if !errors.Is(err, users.ErrInvalid) {
				t.Fatal("unsafe avatar accepted", err)
			}
		}
		avatar := "https://fixture.supabase.co/storage/v1/object/public/avatars/" + caller + "/a.png"
		if _, err := a.Edit(ctx, auth.Identity{ID: caller}, users.Edit{Name: "New name", Username: "renamed", AvatarURL: &avatar}, false); err != nil {
			t.Fatal(err)
		}
		handler := httpapi.New(httpapi.Dependencies{Auth: fixedAuth{}, Accounts: a, Rankings: ranks})
		for _, field := range []string{`"id":"` + other + `"`, `"elo":9999`, `"is_admin":true`, `"username_changed_at":"2000-01-01"`, `"registration_complete":true`} {
			req := httptest.NewRequest("PATCH", "/api/account/profile", strings.NewReader(`{"name":"X","username":"renamed",`+field+`}`))
			req.Header.Set("Authorization", "Bearer fixture")
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, req)
			if w.Code != 400 {
				t.Fatalf("protected field returned %d", w.Code)
			}
		}
		for _, path := range []string{"/api/account/self", "/api/account/profile", "/api/leaderboard/me", "/api/leaderboard?section=regional"} {
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
			if w.Code != 401 {
				t.Fatalf("anonymous %s = %d", path, w.Code)
			}
		}
	})
	t.Run("onboarding commits defaults and safely retries", func(t *testing.T) {
		id := "99999999-9999-4999-8999-999999999999"
		exec("INSERT INTO auth.users(id) VALUES($1)", id)
		edit := users.Edit{Name: "New player", Username: "newplayer"}
		if _, err := a.Edit(ctx, auth.Identity{ID: id}, edit, true); err != nil {
			t.Fatal(err)
		}
		exec("UPDATE public.profiles SET elo=1300,is_admin=true WHERE id=$1", id)
		edit.Name = "stale retry"
		edit.Username = "renamed"
		raw, err := a.Edit(ctx, auth.Identity{ID: id}, edit, true)
		if err != nil {
			t.Fatal(err)
		}
		var p struct {
			Name     string
			Complete bool `json:"registration_complete"`
			Admin    bool `json:"is_admin"`
		}
		_ = json.Unmarshal(raw, &p)
		if p.Name != "New player" || !p.Complete || !p.Admin {
			t.Fatal("onboarding retry overwrote canonical state")
		}
		var elo int
		if err = pool.QueryRow(ctx, "SELECT elo FROM public.profiles WHERE id=$1", id).Scan(&elo); err != nil || elo != 1300 {
			t.Fatal("onboarding overwrote ratings")
		}
	})
}
func TestProfileWriteGuard(t *testing.T) {
	for _, uri := range []string{"postgresql://user@remote.example/setpiece_m4_test_x?sslmode=disable", "postgresql://user@127.0.0.1/postgres?sslmode=disable", "postgresql://user@127.0.0.1/setpiece_m4_test_x?sslmode=disable&host=evil"} {
		_, err := config.Load(func(k string) string {
			switch k {
			case "PROFILE_DATABASE_URL":
				return uri
			case "SUPABASE_URL":
				return "https://fixture.supabase.co"
			}
			return ""
		})
		if err == nil {
			t.Fatal("unsafe profile write configuration accepted")
		}
	}
}
