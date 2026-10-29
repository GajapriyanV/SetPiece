package voting

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/GajapriyanV/SetPiece/backend/internal/auth"
	"github.com/GajapriyanV/SetPiece/backend/internal/debates"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestPostgresVoting(t *testing.T) {
	uri := os.Getenv("SETPIECE_VOTING_TEST_DATABASE_URL")
	if uri == "" {
		t.Skip("isolated voting database not configured")
	}
	u, e := url.Parse(uri)
	if e != nil || u.Hostname() != "127.0.0.1" || !strings.HasPrefix(strings.TrimPrefix(u.Path, "/"), "setpiece_m2_test_") || len(u.Query()) != 1 || u.Query().Get("sslmode") != "disable" {
		t.Fatal("requires fresh loopback setpiece_m2_test_* database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	cfg, e := pgxpool.ParseConfig(uri)
	if e != nil {
		t.Fatal(e)
	}
	cfg.MaxConns = 16
	cfg.ConnConfig.RuntimeParams["statement_timeout"] = "5000"
	cfg.ConnConfig.RuntimeParams["application_name"] = "setpiece_voting_test"
	pool, e := pgxpool.NewWithConfig(ctx, cfg)
	if e != nil {
		t.Fatal(e)
	}
	defer pool.Close()
	var existing *string
	if e = pool.QueryRow(ctx, "SELECT to_regclass('public.profiles')::text").Scan(&existing); e != nil || existing != nil {
		t.Fatal("fixture database must be empty")
	}
	for _, path := range []string{filepath.Join("..", "users", "testdata", "schema.sql"), filepath.Join("..", "..", "migrations", "0001_room_lifecycle.sql"), filepath.Join("..", "..", "migrations", "0002_debate_results.sql")} {
		sql, e := os.ReadFile(path)
		if e != nil {
			t.Fatal(e)
		}
		if _, e = pool.Exec(ctx, string(sql)); e != nil {
			t.Fatal(e)
		}
	}
	ids := []string{}
	for i := 0; i < 80; i++ {
		id := fmt.Sprintf("00000000-0000-4000-8000-%012d", i+1)
		ids = append(ids, id)
		if _, e = pool.Exec(ctx, "INSERT INTO auth.users(id) VALUES($1)", id); e != nil {
			t.Fatal(e)
		}
		if _, e = pool.Exec(ctx, "INSERT INTO public.profiles(id,username) VALUES($1,$2)", id, fmt.Sprintf("fixture%d", i)); e != nil {
			t.Fatal(e)
		}
	}
	repo := debates.NewPostgres(pool)
	rooms := debates.NewService(repo, time.Now, 15*time.Second)
	votes := NewService(pool)
	identity := func(i int) auth.Identity { return auth.Identity{ID: ids[i]} }
	makeDebate := func(a, b int) debates.Room {
		t.Helper()
		r, e := rooms.Create(ctx, ids[a], []debates.Topic{{Topic: "Voting fixture", SideA: "A", SideB: "B"}}, true)
		if e != nil {
			t.Fatal(e)
		}
		r, e = repo.Update(ctx, r.ID, func(r *debates.Room) error {
			for _, i := range append([]int{a, b}, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55) {
				if e := r.Join(ids[i], time.Now()); e != nil {
					return e
				}
			}
			if e := r.Pick(ids[a], "a"); e != nil {
				return e
			}
			if e := r.Pick(ids[b], "b"); e != nil {
				return e
			}
			if e := r.Ready(ids[a], time.Now()); e != nil {
				return e
			}
			return r.Ready(ids[b], time.Now())
		})
		if e != nil {
			t.Fatal(e)
		}
		r, e = repo.Update(ctx, r.ID, func(r *debates.Room) error {
			r.Status = "voting"
			deadline := time.Now().Add(time.Minute)
			r.Deadline = &deadline
			return nil
		})
		if e != nil {
			t.Fatal(e)
		}
		return r
	}
	expire := func(r debates.Room) {
		t.Helper()
		if _, e := pool.Exec(ctx, `UPDATE setpiece_runtime.rooms SET snapshot=jsonb_set(snapshot,'{deadline}',to_jsonb(clock_timestamp()-interval '1 second')),next_due=clock_timestamp()-interval '1 second' WHERE id=$1`, r.ID); e != nil {
			t.Fatal(e)
		}
	}
	profile := func(i int) [5]int {
		t.Helper()
		var out [5]int
		if e := pool.QueryRow(ctx, "SELECT elo,wins,losses,draws,debates_count FROM public.profiles WHERE id=$1", ids[i]).Scan(&out[0], &out[1], &out[2], &out[3], &out[4]); e != nil {
			t.Fatal(e)
		}
		return out
	}
	t.Run("eligibility duplicates totals and repeated finalization", func(t *testing.T) {
		r := makeDebate(0, 1)
		if _, e := votes.Cast(ctx, r.DebateID, identity(0), "a"); !errors.Is(e, ErrForbidden) {
			t.Fatal("speaker admitted", e)
		}
		if _, e := votes.Cast(ctx, r.DebateID, identity(75), "a"); !errors.Is(e, ErrForbidden) {
			t.Fatal("nonmember admitted", e)
		}
		if _, e := votes.Cast(ctx, r.DebateID, identity(40), "c"); !errors.Is(e, ErrInvalid) {
			t.Fatal("invalid side", e)
		}
		if _, e := votes.Cast(ctx, "invalid", identity(40), "a"); !errors.Is(e, ErrInvalid) {
			t.Fatal("invalid ID", e)
		}
		if _, e := repo.Update(ctx, r.ID, func(r *debates.Room) error { r.Disconnect(ids[55], time.Now()); return nil }); e != nil {
			t.Fatal(e)
		}
		if _, e := votes.Cast(ctx, r.DebateID, identity(55), "a"); !errors.Is(e, ErrForbidden) {
			t.Fatal("disconnected member admitted", e)
		}
		var wg sync.WaitGroup
		for i := 0; i < 20; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				if _, e := votes.Cast(ctx, r.DebateID, identity(40), "a"); e != nil {
					t.Error(e)
				}
			}()
		}
		wg.Wait()
		if _, e := votes.Cast(ctx, r.DebateID, identity(40), "b"); !errors.Is(e, ErrConflict) {
			t.Fatal("vote changed", e)
		}
		for i := 41; i <= 50; i++ {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				side := "a"
				if i%2 == 1 {
					side = "b"
				}
				if _, e := votes.Cast(ctx, r.DebateID, identity(i), side); e != nil {
					t.Error(e)
				}
			}(i)
		}
		wg.Wait()
		before, e := votes.Snapshot(ctx, r.DebateID, identity(40))
		if e != nil || before.VotesA != 6 || before.VotesB != 5 || before.OwnVote == nil || *before.OwnVote != "a" {
			t.Fatalf("totals %+v: %v", before, e)
		}
		if _, e := votes.Finalize(ctx, r.DebateID); !errors.Is(e, ErrNotDue) {
			t.Fatal("early finalization", e)
		}
		expire(r)
		results := make(chan State, 16)
		for i := 0; i < 16; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				out, e := votes.Finalize(ctx, r.DebateID)
				if e != nil {
					t.Error(e)
					return
				}
				results <- out
			}()
		}
		wg.Wait()
		close(results)
		var first *State
		for result := range results {
			if first == nil {
				copy := result
				first = &copy
			} else if !reflect.DeepEqual(*first, result) {
				t.Fatal("retry changed result")
			}
		}
		if first == nil || first.Result.Result != "side_a" || first.Result.DebaterA.EloDelta != 16 || first.Result.DebaterB.EloDelta != -16 || first.Revision <= before.Revision {
			t.Fatalf("result %+v", first)
		}
		if got := profile(0); got != [5]int{1216, 1, 0, 0, 1} {
			t.Fatal(got)
		}
		if got := profile(1); got != [5]int{1184, 0, 1, 0, 1} {
			t.Fatal(got)
		}
		if _, e := votes.Cast(ctx, r.DebateID, identity(40), "a"); e != nil {
			t.Fatal("receipt retry after close", e)
		}
		if _, e := votes.Cast(ctx, r.DebateID, identity(51), "a"); !errors.Is(e, ErrClosed) {
			t.Fatal("new vote after close", e)
		}
		after, e := votes.Snapshot(ctx, r.DebateID, identity(40))
		if e != nil || after.VotesA != 6 || after.VotesB != 5 || after.Result == nil {
			t.Fatal("snapshot lost committed result", e)
		}
		var storedA, storedB int
		if e := pool.QueryRow(ctx, "SELECT votes_a,votes_b FROM public.debates WHERE id=$1", r.DebateID).Scan(&storedA, &storedB); e != nil || storedA != after.VotesA || storedB != after.VotesB {
			t.Fatal("totals mismatch", e)
		}
		if _, e := votes.Snapshot(ctx, r.DebateID, identity(75)); !errors.Is(e, ErrForbidden) {
			t.Fatal("unauthorized snapshot", e)
		}
	})
	t.Run("concurrent conflicting choices", func(t *testing.T) {
		r := makeDebate(10, 11)
		var wg sync.WaitGroup
		for i := 0; i < 12; i++ {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				side := "a"
				if i%2 == 0 {
					side = "b"
				}
				_, e := votes.Cast(ctx, r.DebateID, identity(40), side)
				if e != nil && !errors.Is(e, ErrConflict) {
					t.Error(e)
				}
			}(i)
		}
		wg.Wait()
		out, e := votes.Snapshot(ctx, r.DebateID, identity(40))
		if e != nil || out.VotesA+out.VotesB != 1 {
			t.Fatal("duplicate/conflicting votes", e)
		}
	})
	t.Run("zero vote unequal rating draw", func(t *testing.T) {
		if _, e := pool.Exec(ctx, "UPDATE public.profiles SET elo=1600 WHERE id=$1", ids[2]); e != nil {
			t.Fatal(e)
		}
		r := makeDebate(2, 3)
		expire(r)
		out, e := votes.Finalize(ctx, r.DebateID)
		if e != nil {
			t.Fatal(e)
		}
		if out.Result.Result != "draw" || out.Result.WinnerID != nil || out.Result.DebaterA.EloDelta != -13 || out.Result.DebaterB.EloDelta != 13 {
			t.Fatalf("%+v", out.Result)
		}
		if profile(2) != [5]int{1587, 0, 0, 1, 1} || profile(3) != [5]int{1213, 0, 0, 1, 1} {
			t.Fatal("draw counters")
		}
	})
	t.Run("two debates sharing speakers", func(t *testing.T) {
		a, b := makeDebate(4, 5), makeDebate(5, 4)
		for _, r := range []debates.Room{a, b} {
			if _, e := votes.Cast(ctx, r.DebateID, identity(40), "a"); e != nil {
				t.Fatal(e)
			}
			expire(r)
		}
		var wg sync.WaitGroup
		results := make(chan State, 2)
		for _, r := range []debates.Room{a, b} {
			wg.Add(1)
			go func(id string) {
				defer wg.Done()
				out, e := votes.Finalize(ctx, id)
				if e != nil {
					t.Error(e)
				} else {
					results <- out
				}
			}(r.DebateID)
		}
		wg.Wait()
		close(results)
		delta := map[string]int{}
		count := 0
		for out := range results {
			count++
			delta[out.Result.DebaterA.ID] += out.Result.DebaterA.EloDelta
			delta[out.Result.DebaterB.ID] += out.Result.DebaterB.EloDelta
		}
		if count != 2 {
			t.Fatal("missing finalization")
		}
		for _, i := range []int{4, 5} {
			p := profile(i)
			if p != [5]int{1200 + delta[ids[i]], 1, 1, 0, 2} {
				t.Fatal("lost shared-profile update", p)
			}
		}
	})
	t.Run("failed ledger insert rolls back every write", func(t *testing.T) {
		r := makeDebate(6, 7)
		if _, e := votes.Cast(ctx, r.DebateID, identity(40), "b"); e != nil {
			t.Fatal(e)
		}
		expire(r)
		before, _ := votes.Snapshot(ctx, r.DebateID, identity(40))
		_, e := pool.Exec(ctx, `CREATE FUNCTION setpiece_runtime.reject_result() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture failure'; END $$;
 CREATE TRIGGER reject_result BEFORE INSERT ON setpiece_runtime.results FOR EACH ROW EXECUTE FUNCTION setpiece_runtime.reject_result()`)
		if e != nil {
			t.Fatal(e)
		}
		out, e := votes.Finalize(ctx, r.DebateID)
		if e == nil || out.Result != nil {
			t.Fatal("failed transaction published state")
		}
		after, e := votes.Snapshot(ctx, r.DebateID, identity(40))
		if e != nil || !reflect.DeepEqual(before, after) {
			t.Fatal("failed finalization leaked state", e)
		}
		if profile(6) != [5]int{1200, 0, 0, 0, 0} || profile(7) != [5]int{1200, 0, 0, 0, 0} {
			t.Fatal("partial profile update")
		}
		if _, e = pool.Exec(ctx, "DROP TRIGGER reject_result ON setpiece_runtime.results; DROP FUNCTION setpiece_runtime.reject_result()"); e != nil {
			t.Fatal(e)
		}
		if _, e = votes.Finalize(ctx, r.DebateID); e != nil {
			t.Fatal("retry after rollback", e)
		}
	})
	t.Run("waiting vote cannot use transaction start time", func(t *testing.T) {
		r := makeDebate(8, 9)
		locker, e := pool.Begin(ctx)
		if e != nil {
			t.Fatal(e)
		}
		defer locker.Rollback(ctx)
		if _, e = locker.Exec(ctx, "SELECT id FROM setpiece_runtime.rooms WHERE id=$1 FOR UPDATE", r.ID); e != nil {
			t.Fatal(e)
		}
		voteDone := make(chan error, 1)
		go func() { _, err := votes.Cast(ctx, r.DebateID, identity(40), "a"); voteDone <- err }()
		// Prove the request is waiting on the room lock before expiring its deadline.
		until := time.Now().Add(2 * time.Second)
		for {
			var waiting bool
			e = pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='setpiece_voting_test' AND wait_event_type='Lock' AND query LIKE 'SELECT snapshot,revision%')`).Scan(&waiting)
			if e != nil {
				t.Fatal(e)
			}
			if waiting {
				break
			}
			if time.Now().After(until) {
				t.Fatal("vote did not reach room lock")
			}
			time.Sleep(10 * time.Millisecond)
		}
		finalDone := make(chan error, 1)
		go func() { _, err := votes.Finalize(ctx, r.DebateID); finalDone <- err }()
		if _, e = locker.Exec(ctx, `UPDATE setpiece_runtime.rooms SET snapshot=jsonb_set(snapshot,'{deadline}',to_jsonb(clock_timestamp()-interval '1 second')),next_due=clock_timestamp()-interval '1 second' WHERE id=$1`, r.ID); e != nil {
			t.Fatal(e)
		}
		if e = locker.Commit(ctx); e != nil {
			t.Fatal(e)
		}
		if e = <-voteDone; !errors.Is(e, ErrClosed) {
			t.Fatal("late waiting vote admitted", e)
		}
		if e = <-finalDone; e != nil {
			t.Fatal(e)
		}
		out, e := votes.Snapshot(ctx, r.DebateID, identity(40))
		if e != nil || out.VotesA+out.VotesB != 0 || out.Result == nil {
			t.Fatal("closure race totals", e)
		}
	})
	t.Run("legacy debates and cancellation are not finalized", func(t *testing.T) {
		var id string
		if e := pool.QueryRow(ctx, "INSERT INTO public.debates(room_code,topic,side_a_label,side_b_label,status) VALUES('legacy','Legacy','A','B','voting') RETURNING id::text").Scan(&id); e != nil {
			t.Fatal(e)
		}
		if _, e := votes.Finalize(ctx, id); !errors.Is(e, debates.ErrNotFound) {
			t.Fatal("touched legacy debate", e)
		}
		r := makeDebate(12, 13)
		if _, e := repo.Update(ctx, r.ID, func(r *debates.Room) error { r.Leave(ids[12], time.Now(), false); return nil }); e != nil {
			t.Fatal(e)
		}
		if _, e := votes.Finalize(ctx, r.DebateID); !errors.Is(e, ErrClosed) {
			t.Fatal("finalized cancelled debate", e)
		}
	})
	t.Run("worker recovers an expired vote without duplicate Elo", func(t *testing.T) {
		r := makeDebate(14, 15)
		expire(r)
		if e := votes.finalizeDue(ctx); e != nil {
			t.Fatal(e)
		}
		if e := votes.finalizeDue(ctx); e != nil {
			t.Fatal(e)
		}
		out, e := votes.Snapshot(ctx, r.DebateID, identity(40))
		if e != nil || out.Result == nil || profile(14) != [5]int{1200, 0, 0, 1, 1} {
			t.Fatal("worker recovery", e)
		}
	})
}
