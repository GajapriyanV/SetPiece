// Package livekit owns media authorization and reconciliation, not debate rules.
package livekit

import (
	"context"
	"encoding/json"
	"errors"
	"hash/fnv"
	"sort"
	"sync"
	"time"

	"github.com/GajapriyanV/SetPiece/backend/internal/auth"
	"github.com/GajapriyanV/SetPiece/backend/internal/debates"
	lkauth "github.com/livekit/protocol/auth"
	lk "github.com/livekit/protocol/livekit"
	lksdk "github.com/livekit/server-sdk-go/v2"
	"github.com/twitchtv/twirp"
)

var ErrUnavailable = errors.New("media temporarily unavailable")

type Store interface {
	Read(context.Context, string) (debates.Room, error)
}
type API interface {
	ListRooms(context.Context, *lk.ListRoomsRequest) (*lk.ListRoomsResponse, error)
	ListParticipants(context.Context, *lk.ListParticipantsRequest) (*lk.ListParticipantsResponse, error)
	UpdateParticipant(context.Context, *lk.UpdateParticipantRequest) (*lk.ParticipantInfo, error)
	RemoveParticipant(context.Context, *lk.RoomParticipantIdentity) (*lk.RemoveParticipantResponse, error)
	DeleteRoom(context.Context, *lk.DeleteRoomRequest) (*lk.DeleteRoomResponse, error)
}
type Token struct {
	Token      string `json:"token"`
	URL        string `json:"url"`
	CanPublish bool   `json:"canPublish"`
	ExpiresIn  int    `json:"expiresIn"`
}
type Permission struct {
	CanPublish bool  `json:"canPublish"`
	Revision   int64 `json:"revision"`
}
type lease struct {
	AuthExpiresAt int64 `json:"authExpiresAt"`
	RoomCreatedAt int64 `json:"roomCreatedAt"`
}
type Service struct {
	store            Store
	api              API
	url, key, secret string
	now              func() time.Time
	stripes          [64]sync.Mutex
}

func New(store Store, url, key, secret string) *Service {
	return NewWithAPI(store, lksdk.NewRoomServiceClient(url, key, secret), url, key, secret)
}
func NewWithAPI(store Store, api API, url, key, secret string) *Service {
	return &Service{store: store, api: api, url: url, key: key, secret: secret, now: time.Now}
}
func member(r debates.Room, user string) bool {
	m, ok := r.Members[user]
	return ok && m.DepartAt == nil && r.Status != "closed" && r.Status != "closing"
}
func allowed(r debates.Room, user string, now time.Time) bool {
	if !member(r, user) || r.RecoveryAt != nil || r.Deadline == nil || !now.Before(*r.Deadline) {
		return false
	}
	p := r.Phase()
	return p != nil && ((p.Speaker == "a" && r.DebaterA == user) || (p.Speaker == "b" && r.DebaterB == user))
}
func (s *Service) Issue(ctx context.Context, room string, id auth.Identity) (Token, error) {
	r, e := s.store.Read(ctx, room)
	if e != nil {
		return Token{}, e
	}
	if !member(r, id.ID) || !s.now().Before(id.ExpiresAt) {
		return Token{}, debates.ErrForbidden
	}
	// Never embed positive permissions in a reusable JWT. A server-side
	// reconciliation checks current membership, phase, incarnation and Auth expiry.
	no := false
	ttl := time.Minute
	if remaining := id.ExpiresAt.Sub(s.now()); remaining < ttl {
		ttl = remaining
	}
	name := id.ID
	if names, ok := s.store.(interface {
		Name(context.Context, string) (string, error)
	}); ok {
		name, e = names.Name(ctx, id.ID)
		if e != nil {
			return Token{}, ErrUnavailable
		}
	}
	metadata, _ := json.Marshal(lease{id.ExpiresAt.Unix(), r.CreatedAt.UnixMilli()})
	jwt, e := lkauth.NewAccessToken(s.key, s.secret).SetIdentity(id.ID).SetName(name).SetMetadata(string(metadata)).SetValidFor(ttl).SetVideoGrant(&lkauth.VideoGrant{RoomJoin: true, Room: room, CanPublish: &no, CanSubscribe: &no, CanPublishData: &no, CanUpdateOwnMetadata: &no}).ToJWT()
	if e != nil {
		return Token{}, ErrUnavailable
	}
	return Token{Token: jwt, URL: s.url, ExpiresIn: int(ttl.Seconds())}, nil
}
func missing(e error) bool {
	var te twirp.Error
	return errors.As(e, &te) && te.Code() == twirp.NotFound
}
func permission(publish bool) *lk.ParticipantPermission {
	p := &lk.ParticipantPermission{CanSubscribe: true, CanPublish: publish, CanPublishData: false, CanUpdateMetadata: false}
	if publish {
		p.CanPublishSources = []lk.TrackSource{lk.TrackSource_MICROPHONE}
	}
	return p
}
func equal(a, b *lk.ParticipantPermission) bool {
	if a == nil || a.CanPublish != b.CanPublish || a.CanSubscribe != b.CanSubscribe || a.CanPublishData || a.CanUpdateMetadata || len(a.CanPublishSources) != len(b.CanPublishSources) {
		return false
	}
	for i := range a.CanPublishSources {
		if a.CanPublishSources[i] != b.CanPublishSources[i] {
			return false
		}
	}
	return true
}
func (s *Service) lock(id string) *sync.Mutex {
	h := fnv.New32a()
	_, _ = h.Write([]byte(id))
	return &s.stripes[h.Sum32()%64]
}
func (s *Service) Ensure(ctx context.Context, room string, revision int64) error {
	lock := s.lock(room)
	lock.Lock()
	defer lock.Unlock()
	r, e := s.store.Read(ctx, room)
	if e != nil {
		return e
	}
	if revision != 0 && r.Revision != revision {
		return debates.ErrStale
	}
	if r.Status == "closed" || r.Status == "closing" || r.DebateID == "" {
		_, e = s.api.DeleteRoom(ctx, &lk.DeleteRoomRequest{Room: room})
		if e != nil && !missing(e) {
			return ErrUnavailable
		}
		return nil
	}
	response, e := s.api.ListParticipants(ctx, &lk.ListParticipantsRequest{Room: room})
	if missing(e) {
		return nil
	}
	if e != nil {
		return ErrUnavailable
	}
	// Revocations/removals finish before granting the next speaker permission.
	people := response.Participants
	sort.SliceStable(people, func(i, j int) bool {
		return !allowed(r, people[i].Identity, s.now()) && allowed(r, people[j].Identity, s.now())
	})
	for _, p := range people {
		var identity lease
		valid := json.Unmarshal([]byte(p.Metadata), &identity) == nil && identity.AuthExpiresAt > s.now().Unix() && identity.RoomCreatedAt == r.CreatedAt.UnixMilli() && member(r, p.Identity)
		if !valid {
			_, e = s.api.RemoveParticipant(ctx, &lk.RoomParticipantIdentity{Room: room, Identity: p.Identity})
		} else {
			want := permission(allowed(r, p.Identity, s.now()))
			if equal(p.Permission, want) {
				continue
			}
			_, e = s.api.UpdateParticipant(ctx, &lk.UpdateParticipantRequest{Room: room, Identity: p.Identity, Permission: want})
		}
		if e != nil && !missing(e) {
			return ErrUnavailable
		}
	}
	current, e := s.store.Read(ctx, room)
	if e != nil || current.Revision != r.Revision {
		// The phase moved while provider RPCs were in flight. Remove positive publish
		// grants before allowing the caller to retry a newer snapshot.
		for _, p := range people {
			_, _ = s.api.UpdateParticipant(ctx, &lk.UpdateParticipantRequest{Room: room, Identity: p.Identity, Permission: &lk.ParticipantPermission{}})
		}
		return debates.ErrStale
	}
	return nil
}
func (s *Service) Sync(ctx context.Context, room string, id auth.Identity) (Permission, error) {
	r, e := s.store.Read(ctx, room)
	if e != nil {
		return Permission{}, e
	}
	if !member(r, id.ID) || !s.now().Before(id.ExpiresAt) {
		return Permission{}, debates.ErrForbidden
	}
	if e = s.Ensure(ctx, room, r.Revision); e != nil {
		return Permission{}, e
	}
	response, e := s.api.ListParticipants(ctx, &lk.ListParticipantsRequest{Room: room})
	if e != nil {
		return Permission{}, ErrUnavailable
	}
	for _, p := range response.Participants {
		if p.Identity == id.ID {
			return Permission{CanPublish: p.Permission.GetCanPublish() && allowed(r, id.ID, s.now()), Revision: r.Revision}, nil
		}
	}
	return Permission{}, ErrUnavailable
}

// The provider is dedicated to this local/staging runtime. Unknown room names
// are ignored; the service never adopts or deletes a legacy room.
func (s *Service) Run(ctx context.Context, onError func(error)) {
	cursor := 0
	ticks := time.NewTicker(500 * time.Millisecond)
	defer ticks.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticks.C:
			batch, cancel := context.WithTimeout(ctx, 3*time.Second)
			rooms, e := s.api.ListRooms(batch, &lk.ListRoomsRequest{})
			if e == nil {
				jobs := make(chan string)
				var wg sync.WaitGroup
				var failed bool
				var mu sync.Mutex
				for i := 0; i < 4; i++ {
					wg.Add(1)
					go func() {
						defer wg.Done()
						for id := range jobs {
							if e := s.Ensure(batch, id, 0); e != nil && !errors.Is(e, debates.ErrNotFound) && !errors.Is(e, debates.ErrStale) {
								mu.Lock()
								failed = true
								mu.Unlock()
							}
						}
					}()
				}
				sort.Slice(rooms.Rooms, func(i, j int) bool { return rooms.Rooms[i].Name < rooms.Rooms[j].Name })
				count := len(rooms.Rooms)
				for i := 0; i < count && i < 128; i++ {
					r := rooms.Rooms[(cursor+i)%count]
					select {
					case jobs <- r.Name:
					case <-batch.Done():
					}
				}
				if count > 0 {
					cursor = (cursor + min(count, 128)) % count
				}
				close(jobs)
				wg.Wait()
				if failed {
					e = ErrUnavailable
				}
			}
			cancel()
			if e != nil && onError != nil {
				onError(ErrUnavailable)
			}
		}
	}
}
