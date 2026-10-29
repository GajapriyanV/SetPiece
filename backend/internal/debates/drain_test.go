package debates

import (
	"context"
	"errors"
	"testing"
	"time"
)

type drainRepo struct {
	Repository
	entered, release chan struct{}
	room             Room
}

func (r *drainRepo) Create(ctx context.Context, v Room) (Room, error) {
	if r.entered != nil {
		close(r.entered)
		select {
		case <-r.release:
		case <-ctx.Done():
			return Room{}, ctx.Err()
		}
	}
	return v, nil
}
func (r *drainRepo) Update(_ context.Context, _ string, f func(*Room) error) (Room, error) {
	e := f(&r.room)
	return r.room, e
}
func TestDrainWaitsForAdmittedCreation(t *testing.T) {
	r := &drainRepo{entered: make(chan struct{}), release: make(chan struct{})}
	s := NewService(r, nil, 0)
	created := make(chan error, 1)
	go func() {
		_, e := s.Create(context.Background(), "owner", []Topic{{"Question", "A", "B"}}, false)
		created <- e
	}()
	<-r.entered
	done := make(chan struct{})
	go func() { s.SetDraining(true); close(done) }()
	select {
	case <-done:
		t.Fatal("drain acknowledged before admitted transaction finished")
	case <-time.After(30 * time.Millisecond):
	}
	close(r.release)
	if e := <-created; e != nil {
		t.Fatal(e)
	}
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("drain blocked")
	}
	if _, e := s.Create(context.Background(), "owner", nil, false); !errors.Is(e, ErrDraining) {
		t.Fatal(e)
	}
	if _, e := s.Command(context.Background(), "room", "owner", "ready", "", 0); !errors.Is(e, ErrDraining) {
		t.Fatal(e)
	}
	s.SetDraining(false)
	r.entered = nil
	if _, e := s.Create(context.Background(), "owner", []Topic{{"Question", "A", "B"}}, false); e != nil {
		t.Fatal(e)
	}
}
func TestDrainAllowsExistingCountdownAndVoting(t *testing.T) {
	r := &drainRepo{room: room(t, false)}
	ready(t, &r.room, epoch)
	now := epoch.Add(5 * time.Second)
	s := NewService(r, func() time.Time { return now }, 0)
	s.SetDraining(true)
	v, e := s.Tick(context.Background(), r.room.ID, r.room.Revision)
	if e != nil || v.Status != "live" {
		t.Fatalf("countdown interrupted: %s %v", v.Status, e)
	}
	for v.Status == "live" {
		now = *v.Deadline
		v, e = s.Tick(context.Background(), v.ID, v.Revision)
		if e != nil {
			t.Fatal(e)
		}
	}
	if v.Status != "voting" {
		t.Fatal(v.Status)
	}
	now = *v.Deadline
	v, e = s.Tick(context.Background(), v.ID, v.Revision)
	if e != nil || v.Status != "awaiting_result" {
		t.Fatalf("voting interrupted: %s %v", v.Status, e)
	}
}
