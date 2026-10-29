package debates

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestPostgresLifecycle(t *testing.T) {
	raw := os.Getenv("SETPIECE_LIFECYCLE_TEST_DATABASE_URL")
	if raw == "" {
		t.Skip("isolated lifecycle database not configured")
	}
	u, e := url.Parse(raw)
	if e != nil || u.Hostname() != "127.0.0.1" || !strings.HasPrefix(strings.TrimPrefix(u.Path, "/"), "setpiece_m2_test_") || len(u.Query()) > 1 || u.Query().Get("sslmode") != "disable" {
		t.Fatal("requires disposable loopback setpiece_m2_test_* database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	pool, e := pgxpool.New(ctx, raw)
	if e != nil {
		t.Fatal(e)
	}
	defer pool.Close()
	var existing *string
	if e = pool.QueryRow(ctx, "SELECT to_regclass('public.profiles')::text").Scan(&existing); e != nil || existing != nil {
		t.Fatal("fixture database must be empty")
	}
	fixture, e := os.ReadFile(filepath.Join("..", "users", "testdata", "schema.sql"))
	if e != nil {
		t.Fatal(e)
	}
	if _, e = pool.Exec(ctx, string(fixture)); e != nil {
		t.Fatal(e)
	}
	migration, e := os.ReadFile(filepath.Join("..", "..", "migrations", "0001_room_lifecycle.sql"))
	if e != nil {
		t.Fatal(e)
	}
	if _, e = pool.Exec(ctx, string(migration)); e != nil {
		t.Fatal(e)
	}
	ids := []string{}
	for i := 1; i <= 60; i++ {
		id := fmt.Sprintf("00000000-0000-4000-8000-%012d", i)
		ids = append(ids, id)
		if _, e = pool.Exec(ctx, "INSERT INTO auth.users(id) VALUES($1)", id); e != nil {
			t.Fatal(e)
		}
		if _, e = pool.Exec(ctx, "INSERT INTO public.profiles(id,username) VALUES($1,$2)", id, fmt.Sprint("fixture", i)); e != nil {
			t.Fatal(e)
		}
	}
	repo := NewPostgres(pool)
	var nanos atomic.Int64
	nanos.Store(epoch.UnixNano())
	clock := func() time.Time { return time.Unix(0, nanos.Load()).UTC() }
	service := NewService(repo, clock, 15*time.Second)
	r, e := service.Create(ctx, ids[0], []Topic{{"Fixture", "A", "B"}}, false)
	if e != nil {
		t.Fatal(e)
	}
	// Race independent SQL writers so correctness cannot come only from service mutexes.
	var wg sync.WaitGroup
	var accepted atomic.Int32
	for _, user := range ids[:20] {
		wg.Add(1)
		go func(user string) {
			defer wg.Done()
			_, err := repo.Update(ctx, r.ID, func(r *Room) error { return r.Join(user, clock()) })
			if err == nil {
				accepted.Add(1)
			} else if !errors.Is(err, ErrConflict) {
				t.Error(err)
			}
		}(user)
	}
	wg.Wait()
	if accepted.Load() != 6 {
		t.Fatalf("admitted %d, expected 6", accepted.Load())
	}
	r, e = repo.Read(ctx, r.ID)
	if e != nil {
		t.Fatal(e)
	}
	users := []string{}
	for user := range r.Members {
		users = append(users, user)
	}
	accepted.Store(0)
	for _, user := range users {
		wg.Add(1)
		go func(user string) {
			defer wg.Done()
			_, err := repo.Update(ctx, r.ID, func(r *Room) error { return r.Pick(user, "a") })
			if err == nil {
				accepted.Add(1)
			} else if !errors.Is(err, ErrConflict) {
				t.Error(err)
			}
		}(user)
	}
	wg.Wait()
	if accepted.Load() != 1 {
		t.Fatal("side was not exclusive")
	}
	r, _ = repo.Read(ctx, r.ID)
	a, b := "", ""
	for uid, m := range r.Members {
		if m.Side == "a" {
			a = uid
		} else {
			b = uid
		}
	}
	if _, e = service.Join(ctx, r.ID, a, "tab1"); e != nil {
		t.Fatal(e)
	}
	if _, e = service.Join(ctx, r.ID, a, "tab2"); e != nil {
		t.Fatal(e)
	}
	if _, e = service.Join(ctx, r.ID, b, "tabB"); e != nil {
		t.Fatal(e)
	}
	current, _ := repo.Read(ctx, r.ID)
	if _, e = service.Command(ctx, r.ID, b, "pick", "b", current.Revision); e != nil {
		t.Fatal(e)
	}
	if _, e = service.Disconnect(ctx, r.ID, a, "tab1", true); e != nil {
		t.Fatal(e)
	}
	r, _ = repo.Read(ctx, r.ID)
	if r.Members[a].DepartAt != nil || r.Members[a].Side != "a" {
		t.Fatal("one tab removed other tab's membership")
	}
	current, _ = repo.Read(ctx, r.ID)
	if _, e = service.Command(ctx, r.ID, a, "ready", "", current.Revision); e != nil {
		t.Fatal(e)
	}
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := repo.Update(ctx, r.ID, func(r *Room) error { return r.Ready(b, clock()) })
			if err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	r, e = repo.Read(ctx, r.ID)
	if e != nil {
		t.Fatal(e)
	}
	var count int
	if e = pool.QueryRow(ctx, "SELECT count(*) FROM public.debates WHERE room_code=$1", r.ID).Scan(&count); e != nil || count != 1 || r.Status != "countdown" {
		t.Fatalf("duplicate start: %d %v", count, e)
	}
	if _, e = service.Command(ctx, r.ID, a, "skip", "", 1); !errors.Is(e, ErrStale) {
		t.Fatal("stale client command accepted")
	}
	old := r.Revision
	nanos.Store(epoch.Add(5 * time.Second).UnixNano())
	r, e = service.Tick(ctx, r.ID, old)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = service.Tick(ctx, r.ID, old); !errors.Is(e, ErrStale) {
		t.Fatal("stale timer accepted")
	}
	// All statements must roll back, including the debate insert if later room persistence fails.
	failRoom, e := service.Create(ctx, ids[0], []Topic{{"Rollback", "A", "B"}}, false)
	if e != nil {
		t.Fatal(e)
	}
	for i, user := range ids[:2] {
		_, e = repo.Update(ctx, failRoom.ID, func(r *Room) error {
			if e := r.Join(user, clock()); e != nil {
				return e
			}
			return r.Pick(user, []string{"a", "b"}[i])
		})
		if e != nil {
			t.Fatal(e)
		}
	}
	_, e = repo.Update(ctx, failRoom.ID, func(r *Room) error { return r.Ready(ids[0], clock()) })
	if e != nil {
		t.Fatal(e)
	}
	_, e = repo.Update(ctx, failRoom.ID, func(r *Room) error {
		if e := r.Ready(ids[1], clock()); e != nil {
			return e
		}
		m := r.Members[ids[1]]
		m.Slot = r.Members[ids[0]].Slot
		r.Members[ids[1]] = m
		return nil
	})
	if e == nil {
		t.Fatal("expected member-slot constraint failure")
	}
	if e = pool.QueryRow(ctx, "SELECT count(*) FROM public.debates WHERE room_code=$1", failRoom.ID).Scan(&count); e != nil || count != 0 {
		t.Fatal("failed transaction leaked debate")
	}
	unchanged, _ := repo.Read(ctx, failRoom.ID)
	if unchanged.Status != "lobby" || unchanged.Members[ids[1]].Ready {
		t.Fatal("failed transaction leaked room state")
	}
	// Actual constraints also protect callers bypassing the service.
	_, e = pool.Exec(ctx, "INSERT INTO setpiece_runtime.members(room_id,capacity,user_id,slot,joined_at) VALUES($1,6,$2,7,now())", r.ID, ids[59])
	if e == nil {
		t.Fatal("database accepted over-capacity slot")
	}
	// New process loses connections; missing speaker cancels only this runtime-owned debate.
	restarted := NewService(repo, clock, 15*time.Second)
	if e = restarted.Recover(ctx); e != nil {
		t.Fatal(e)
	}
	recovered, _ := repo.Read(ctx, r.ID)
	nanos.Store(clock().Add(15 * time.Second).UnixNano())
	_, e = restarted.Tick(ctx, r.ID, recovered.Revision)
	if e != nil {
		t.Fatal(e)
	}
	var status string
	if e = pool.QueryRow(ctx, "SELECT status FROM public.debates WHERE id=$1", r.DebateID).Scan(&status); e != nil || status != "cancelled" {
		t.Fatal("recovery did not persist cancellation", e)
	}
	// Voting survives restart, result exposure waits for an already committed finalization.
	finalRoom, e := service.Create(ctx, ids[0], []Topic{{"Voting", "A", "B"}}, true)
	if e != nil {
		t.Fatal(e)
	}
	for i, user := range ids[:2] {
		_, e = repo.Update(ctx, finalRoom.ID, func(r *Room) error {
			if e := r.Join(user, clock()); e != nil {
				return e
			}
			if e := r.Pick(user, []string{"a", "b"}[i]); e != nil {
				return e
			}
			return r.Ready(user, clock())
		})
		if e != nil {
			t.Fatal(e)
		}
	}
	finalRoom, _ = repo.Read(ctx, finalRoom.ID)
	nanos.Store(clock().Add(485 * time.Second).UnixNano())
	finalRoom, e = service.Tick(ctx, finalRoom.ID, finalRoom.Revision)
	if e != nil || finalRoom.Status != "voting" {
		t.Fatal("voting", e)
	}
	restarted = NewService(repo, clock, 15*time.Second)
	if e = restarted.Recover(ctx); e != nil {
		t.Fatal(e)
	}
	finalRoom, _ = repo.Read(ctx, finalRoom.ID)
	nanos.Store(clock().Add(30 * time.Second).UnixNano())
	finalRoom, e = restarted.Tick(ctx, finalRoom.ID, finalRoom.Revision)
	if e != nil || finalRoom.Status != "awaiting_result" {
		t.Fatal("awaiting finalization", e)
	}
	if _, e = restarted.RefreshResult(ctx, finalRoom.ID, finalRoom.DebateID); !errors.Is(e, ErrNotFinalized) {
		t.Fatal("uncommitted result exposed")
	}
	// Test fixture stands in for phase 2B; application code never writes results/Elo.
	if _, e = pool.Exec(ctx, "UPDATE public.debates SET status='finished',result='draw',finished_at=now() WHERE id=$1", finalRoom.DebateID); e != nil {
		t.Fatal(e)
	}
	finalRoom, e = restarted.RefreshResult(ctx, finalRoom.ID, finalRoom.DebateID)
	if e != nil {
		t.Fatal(e)
	}
	deadline := *finalRoom.Deadline
	again, e := restarted.RefreshResult(ctx, finalRoom.ID, finalRoom.DebateID)
	if e != nil || !again.Deadline.Equal(deadline) {
		t.Fatal("finalization notification retry extended results")
	}
	nanos.Store(deadline.UnixNano())
	finalRoom, e = restarted.Tick(ctx, again.ID, again.Revision)
	if e != nil || finalRoom.Completed != 1 {
		t.Fatal("completion", e)
	}
	// No ratings touched by lifecycle.
	if e = pool.QueryRow(ctx, "SELECT count(*) FROM public.profiles WHERE elo<>1200 OR debates_count<>0").Scan(&count); e != nil || count != 0 {
		t.Fatal("lifecycle changed Elo")
	}
	// Cancellation interrupts SQL and rolls back.
	cancelled, stop := context.WithCancel(ctx)
	stop()
	if _, e = repo.Update(cancelled, r.ID, func(*Room) error { return nil }); e == nil {
		t.Fatal("cancelled context accepted")
	}
	if e = pool.Ping(ctx); e != nil {
		t.Fatal(e)
	}
}
