package debates

import (
	"errors"
	"testing"
	"time"
)

var epoch = time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)

func room(t *testing.T, featured bool) Room {
	t.Helper()
	r, e := newRoom("owner", []Topic{{"Question", "A", "B"}}, featured, epoch)
	if e != nil {
		t.Fatal(e)
	}
	return r
}
func ready(t *testing.T, r *Room, now time.Time) {
	t.Helper()
	for _, pair := range [][2]string{{"alice", "a"}, {"bob", "b"}} {
		if e := r.Join(pair[0], now); e != nil {
			t.Fatal(e)
		}
		if e := r.Pick(pair[0], pair[1]); e != nil {
			t.Fatal(e)
		}
		if e := r.Ready(pair[0], now); e != nil {
			t.Fatal(e)
		}
	}
}
func TestLifecycleDeadlines(t *testing.T) {
	r := room(t, false)
	ready(t, &r, epoch)
	if r.Status != "countdown" || len(r.DebateID) != 36 {
		t.Fatalf("no durable identity: %+v", r)
	}
	id := r.DebateID
	if e := r.Ready("bob", epoch); e != nil || r.DebateID != id {
		t.Fatal("ready retry started twice")
	}
	r.Advance(epoch.Add(4 * time.Second))
	if r.Status != "countdown" {
		t.Fatal("early timer")
	}
	now := epoch.Add(5 * time.Second)
	r.Advance(now)
	for i, p := range phases {
		if r.Status != "live" || r.PhaseIndex != i || r.Phase().Name != p.Name || !r.Deadline.Equal(now.Add(p.Duration)) {
			t.Fatalf("phase %d: %+v", i, r)
		}
		now = now.Add(p.Duration)
		r.Advance(now)
	}
	if r.Status != "voting" || !r.Deadline.Equal(now.Add(30*time.Second)) {
		t.Fatal("voting deadline")
	}
	r.Advance(now.Add(30 * time.Second))
	if r.Status != "awaiting_result" || r.DebateID != id || r.Deadline != nil {
		t.Fatal("must await transactional finalizer")
	}
	r.Advance(now.Add(24 * time.Hour))
	if r.Status != "awaiting_result" {
		t.Fatal("cannot manufacture results")
	}
}
func TestSideMembershipAndCapacity(t *testing.T) {
	r := room(t, false)
	if e := r.Pick("stranger", "a"); !errors.Is(e, ErrForbidden) {
		t.Fatal(e)
	}
	for _, u := range []string{"a", "b", "c", "d", "e", "f"} {
		if e := r.Join(u, epoch); e != nil {
			t.Fatal(e)
		}
	}
	if e := r.Join("g", epoch); !errors.Is(e, ErrConflict) {
		t.Fatal("capacity")
	}
	if e := r.Join("a", epoch); e != nil {
		t.Fatal("rejoin at capacity")
	}
	if e := r.Pick("a", "a"); e != nil {
		t.Fatal(e)
	}
	if e := r.Pick("b", "a"); !errors.Is(e, ErrConflict) {
		t.Fatal("same side")
	}
	if e := r.Pick("a", "b"); e != nil {
		t.Fatal(e)
	}
	if e := r.Pick("a", ""); e != nil {
		t.Fatal(e)
	}
	if e := r.Ready("a", epoch); !errors.Is(e, ErrConflict) {
		t.Fatal("ready spectator")
	}
}
func TestDisconnectAndExplicitLeave(t *testing.T) {
	for _, featured := range []bool{false, true} {
		r := room(t, featured)
		ready(t, &r, epoch)
		r.Advance(epoch.Add(5 * time.Second))
		r.Disconnect("alice", epoch.Add(6*time.Second))
		r.Advance(epoch.Add(20 * time.Second))
		if r.Status != "live" {
			t.Fatal("grace shortened")
		}
		if e := r.Join("alice", epoch.Add(20*time.Second)); e != nil {
			t.Fatal(e)
		}
		r.Advance(epoch.Add(21 * time.Second))
		if r.Status != "live" {
			t.Fatal("stale disconnect cancelled rejoin")
		}
		r.Leave("alice", epoch.Add(22*time.Second), false)
		if r.Status != "lobby" || r.DebateID != "" || r.Completed != 0 || r.TopicIndex != 0 {
			t.Fatal("leave must cancel and repeat topic")
		}
	}
	r := room(t, false)
	ready(t, &r, epoch)
	r.Disconnect("alice", epoch)
	r.Advance(epoch.Add(15 * time.Second))
	if r.Status != "lobby" {
		t.Fatal("disconnect expiry must cancel")
	}
}
func TestFeaturedSkipTimeoutCompletionAndCleanup(t *testing.T) {
	r := room(t, true)
	r.Topics = append(r.Topics, Topic{"Second", "C", "D"})
	if e := r.Join("alice", epoch); e != nil {
		t.Fatal(e)
	}
	if r.Deadline != nil {
		t.Fatal("need two members")
	}
	if e := r.Join("bob", epoch); e != nil {
		t.Fatal(e)
	}
	if e := r.Skip("alice", epoch); e != nil {
		t.Fatal(e)
	}
	_ = r.Skip("alice", epoch)
	if r.TopicIndex != 0 {
		t.Fatal("skip retry counted twice")
	}
	_ = r.Skip("bob", epoch)
	if r.TopicIndex != 1 || r.Completed != 0 || len(r.SkipVoters) != 0 {
		t.Fatal("two distinct skips")
	}
	r.Advance(epoch.Add(30 * time.Second))
	if r.TopicIndex != 0 {
		t.Fatal("featured timeout")
	}
	now := epoch
	for i := 0; i < 5; i++ {
		// Results are supplied only by the future transactional finalizer (repository enforces it).
		r.Status = "results"
		r.Deadline = after(now, time.Minute)
		now = now.Add(time.Minute)
		r.Advance(now)
		if r.Completed != i+1 {
			t.Fatal("completion count")
		}
	}
	if r.Status != "closing" {
		t.Fatal("fifth completion closes")
	}
	r.Advance(now.Add(30 * time.Second))
	if r.Status != "closed" {
		t.Fatal("closing warning")
	}
	idle := room(t, true)
	idle.Advance(epoch.Add(40 * time.Minute))
	if idle.Status != "closing" {
		t.Fatal("featured empty cleanup")
	}
	normal := room(t, false)
	normal.Advance(epoch.Add(3 * time.Minute))
	if normal.Status != "closed" {
		t.Fatal("regular empty cleanup")
	}
}
func TestRestartRecovery(t *testing.T) {
	t.Run("speakers return", func(t *testing.T) {
		r := room(t, false)
		ready(t, &r, epoch)
		r.Advance(epoch.Add(5 * time.Second))
		r.Recover(epoch.Add(10*time.Second), 15*time.Second)
		r.Recover(epoch.Add(11*time.Second), 15*time.Second)
		if !r.RecoveryAt.Equal(epoch.Add(25 * time.Second)) {
			t.Fatal("restart extended grace")
		}
		r.Advance(epoch.Add(20 * time.Second))
		if r.Status != "live" {
			t.Fatal("premature cancellation")
		}
		_ = r.Join("alice", epoch.Add(20*time.Second))
		_ = r.Join("bob", epoch.Add(20*time.Second))
		r.Advance(epoch.Add(20 * time.Second))
		if r.RecoveryAt != nil || !r.Deadline.Equal(epoch.Add(155*time.Second)) {
			t.Fatal("lost absolute phase deadline")
		}
	})
	t.Run("speaker missing", func(t *testing.T) {
		r := room(t, false)
		ready(t, &r, epoch)
		r.Recover(epoch.Add(time.Second), 15*time.Second)
		r.Advance(epoch.Add(16 * time.Second))
		if r.Status != "lobby" || r.DebateID != "" {
			t.Fatal("missing speaker must cancel")
		}
	})
	t.Run("preserve voting", func(t *testing.T) {
		r := room(t, false)
		ready(t, &r, epoch)
		r.Advance(epoch.Add(485 * time.Second))
		if r.Status != "voting" {
			t.Fatal(r.Status)
		}
		r.Recover(epoch.Add(486*time.Second), 15*time.Second)
		r.Advance(epoch.Add(515 * time.Second))
		if r.Status != "awaiting_result" || r.DebateID == "" {
			t.Fatal("restart must preserve voting")
		}
	})
}
