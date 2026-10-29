package debates

import (
	"context"
	"errors"
	"hash/fnv"
	"sync"
	"time"
)

// A single Service owns ephemeral connections. PostgreSQL remains authoritative
// for all durable changes. Striped locks bound mutex memory without one global lock.
type Service struct {
	repo    Repository
	now     func() time.Time
	grace   time.Duration
	stripes [64]struct {
		sync.Mutex
		connections map[string]map[string]map[string]bool
	}
}

func NewService(repo Repository, now func() time.Time, grace time.Duration) *Service {
	if now == nil {
		now = time.Now
	}
	if grace <= 0 {
		grace = 15 * time.Second
	}
	s := &Service{repo: repo, now: now, grace: grace}
	for i := range s.stripes {
		s.stripes[i].connections = map[string]map[string]map[string]bool{}
	}
	return s
}
func (s *Service) stripe(id string) int {
	h := fnv.New32a()
	_, _ = h.Write([]byte(id))
	return int(h.Sum32() % 64)
}
func (s *Service) Create(ctx context.Context, user string, topics []Topic, featured bool) (Room, error) {
	r, e := newRoom(user, topics, featured, s.now())
	if e != nil {
		return Room{}, e
	}
	return s.repo.Create(ctx, r)
}
func (s *Service) List(ctx context.Context, after string, limit int) ([]Room, error) {
	return s.repo.Page(ctx, after, limit)
}
func (s *Service) State(ctx context.Context, room, user string) (Room, error) {
	r, e := s.repo.Read(ctx, room)
	if e != nil {
		return Room{}, e
	}
	if _, ok := r.Members[user]; !ok && r.Creator != user {
		return Room{}, ErrForbidden
	}
	return r, nil
}

// Join/Disconnect take a transport-generated connection ID, never a client user ID.
// Future WebSocket transport must leave its prior room before switching rooms.
func (s *Service) Join(ctx context.Context, room, user, connection string) (Room, error) {
	if user == "" || connection == "" {
		return Room{}, ErrInvalid
	}
	stripe := &s.stripes[s.stripe(room)]
	stripe.Lock()
	defer stripe.Unlock()
	r, e := s.repo.Update(ctx, room, func(r *Room) error {
		r.Advance(s.now())
		if e := r.Join(user, s.now()); e != nil {
			return e
		}
		r.Advance(s.now())
		return nil
	})
	if e != nil {
		return Room{}, e
	}
	if stripe.connections[room] == nil {
		stripe.connections[room] = map[string]map[string]bool{}
	}
	if stripe.connections[room][user] == nil {
		stripe.connections[room][user] = map[string]bool{}
	}
	stripe.connections[room][user][connection] = true
	return r, nil
}
func (s *Service) Disconnect(ctx context.Context, room, user, connection string, explicit bool) (Room, error) {
	stripe := &s.stripes[s.stripe(room)]
	stripe.Lock()
	defer stripe.Unlock()
	connections := stripe.connections[room][user]
	if !connections[connection] {
		return s.repo.Read(ctx, room)
	}
	r, e := s.repo.Update(ctx, room, func(r *Room) error {
		r.Advance(s.now())
		if len(connections) == 1 {
			if explicit {
				r.Leave(user, s.now(), false)
			} else {
				r.Disconnect(user, s.now())
			}
		}
		return nil
	})
	if e != nil {
		return Room{}, e
	}
	delete(connections, connection)
	if len(connections) == 0 {
		delete(stripe.connections[room], user)
	}
	if len(stripe.connections[room]) == 0 {
		delete(stripe.connections, room)
	}
	return r, nil
}
func (s *Service) Command(ctx context.Context, room, user, kind, side string, revision int64) (Room, error) {
	stripe := &s.stripes[s.stripe(room)]
	stripe.Lock()
	defer stripe.Unlock()
	if len(stripe.connections[room][user]) == 0 {
		return Room{}, ErrForbidden
	}
	return s.repo.Update(ctx, room, func(r *Room) error {
		if r.Revision != revision || due(r.NextDue(), s.now()) {
			return ErrStale
		}
		switch kind {
		case "pick":
			return r.Pick(user, side)
		case "ready":
			return r.Ready(user, s.now())
		case "skip":
			return r.Skip(user, s.now())
		default:
			return ErrInvalid
		}
	})
}
func (s *Service) Tick(ctx context.Context, room string, revision int64) (Room, error) {
	stripe := &s.stripes[s.stripe(room)]
	stripe.Lock()
	defer stripe.Unlock()
	r, e := s.repo.Update(ctx, room, func(r *Room) error {
		if r.Revision != revision {
			return ErrStale
		}
		r.Advance(s.now())
		return nil
	})
	if e == nil {
		for user := range stripe.connections[room] {
			if _, ok := r.Members[user]; !ok {
				delete(stripe.connections[room], user)
			}
		}
		if r.Status == "closed" || len(stripe.connections[room]) == 0 {
			delete(stripe.connections, room)
		}
	}
	return r, e
}

// RefreshResult is INTERNAL, not a client command. The repository requires a
// committed finished debate; phase 2B will own votes, ratings and that write.
func (s *Service) RefreshResult(ctx context.Context, room, debate string) (Room, error) {
	return s.repo.Update(ctx, room, func(r *Room) error {
		if r.DebateID != debate {
			return ErrStale
		}
		if r.Status == "results" {
			return nil
		}
		if r.Status != "awaiting_result" {
			return ErrConflict
		}
		r.Status = "results"
		r.Deadline = after(s.now(), time.Minute)
		return nil
	})
}

// Recover must finish before transports start; no concurrent startup/Join calls.
func (s *Service) Recover(ctx context.Context) error {
	cursor := ""
	for {
		rooms, e := s.repo.Page(ctx, cursor, 100)
		if e != nil {
			return e
		}
		if len(rooms) == 0 {
			return nil
		}
		for _, room := range rooms {
			if _, e = s.repo.Update(ctx, room.ID, func(r *Room) error { r.Recover(s.now(), s.grace); r.Advance(s.now()); return nil }); e != nil {
				return e
			}
			cursor = room.ID
		}
	}
}

// Run accepts an injected scheduler channel; tests drive exact deadlines without sleep.
func (s *Service) Run(ctx context.Context, ticks <-chan time.Time, onError func(error)) {
	for {
		select {
		case <-ctx.Done():
			return
		case _, ok := <-ticks:
			if !ok {
				return
			}
			batchCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
			rooms, e := s.repo.Due(batchCtx, s.now(), 100)
			if e == nil {
				for _, r := range rooms {
					_, e = s.Tick(batchCtx, r.ID, r.Revision)
					if e != nil && !errors.Is(e, ErrStale) {
						break
					}
					e = nil
				}
			}
			cancel()
			if e != nil && onError != nil {
				onError(e)
			}
		}
	}
}
