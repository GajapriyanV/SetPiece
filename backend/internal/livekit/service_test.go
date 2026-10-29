package livekit

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"github.com/GajapriyanV/SetPiece/backend/internal/auth"
	"github.com/GajapriyanV/SetPiece/backend/internal/debates"
	lk "github.com/livekit/protocol/livekit"
	"strings"
	"sync"
	"testing"
	"time"
)

type memoryStore struct {
	mu   sync.Mutex
	room debates.Room
}

func (m *memoryStore) Read(_ context.Context, id string) (debates.Room, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if id != m.room.ID {
		return debates.Room{}, debates.ErrNotFound
	}
	b, _ := json.Marshal(m.room)
	var r debates.Room
	_ = json.Unmarshal(b, &r)
	return r, nil
}
func (m *memoryStore) change(fn func(*debates.Room)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	fn(&m.room)
	m.room.Revision++
}
func fixtureStore() *memoryStore {
	now := time.Now()
	deadline := now.Add(time.Minute)
	return &memoryStore{room: debates.Room{ID: "abcdef12", Revision: 1, CreatedAt: now, Status: "live", PhaseIndex: 0, Deadline: &deadline, DebateID: "debate", DebaterA: "a", DebaterB: "b", Members: map[string]debates.Member{"a": {UserID: "a"}, "b": {UserID: "b"}, "c": {UserID: "c"}}}}
}

type fakeAPI struct {
	people []*lk.ParticipantInfo
	calls  []string
	fail   bool
	after  func()
}

func (f *fakeAPI) ListRooms(context.Context, *lk.ListRoomsRequest) (*lk.ListRoomsResponse, error) {
	return &lk.ListRoomsResponse{}, nil
}
func (f *fakeAPI) ListParticipants(context.Context, *lk.ListParticipantsRequest) (*lk.ListParticipantsResponse, error) {
	if f.fail {
		return nil, errors.New("private upstream details")
	}
	return &lk.ListParticipantsResponse{Participants: f.people}, nil
}
func (f *fakeAPI) UpdateParticipant(_ context.Context, r *lk.UpdateParticipantRequest) (*lk.ParticipantInfo, error) {
	f.calls = append(f.calls, "update:"+r.Identity)
	for _, p := range f.people {
		if p.Identity == r.Identity {
			p.Permission = r.Permission
		}
	}
	if f.after != nil {
		fn := f.after
		f.after = nil
		fn()
	}
	return &lk.ParticipantInfo{}, nil
}
func (f *fakeAPI) RemoveParticipant(_ context.Context, r *lk.RoomParticipantIdentity) (*lk.RemoveParticipantResponse, error) {
	f.calls = append(f.calls, "remove:"+r.Identity)
	return &lk.RemoveParticipantResponse{}, nil
}
func (f *fakeAPI) DeleteRoom(context.Context, *lk.DeleteRoomRequest) (*lk.DeleteRoomResponse, error) {
	if f.fail {
		return nil, errors.New("private upstream details")
	}
	f.calls = append(f.calls, "delete")
	return &lk.DeleteRoomResponse{}, nil
}
func people(store *memoryStore) []*lk.ParticipantInfo {
	r, _ := store.Read(context.Background(), "abcdef12")
	metadata, _ := json.Marshal(lease{time.Now().Add(time.Hour).Unix(), r.CreatedAt.UnixMilli()})
	out := []*lk.ParticipantInfo{}
	for _, id := range []string{"a", "b", "c"} {
		out = append(out, &lk.ParticipantInfo{Identity: id, Metadata: string(metadata), Permission: permission(false)})
	}
	return out
}
func TestTokenRequiresCurrentMembershipAndHasNoReusablePositiveGrants(t *testing.T) {
	store := fixtureStore()
	s := NewWithAPI(store, &fakeAPI{}, "ws://127.0.0.1:7880", "devkey", "secret")
	ctx := context.Background()
	for _, id := range []auth.Identity{{ID: "stranger", ExpiresAt: time.Now().Add(time.Hour)}, {ID: "a", ExpiresAt: time.Now().Add(-time.Second)}} {
		if _, e := s.Issue(ctx, "abcdef12", id); !errors.Is(e, debates.ErrForbidden) {
			t.Fatalf("unauthorized token: %v", e)
		}
	}
	token, e := s.Issue(ctx, "abcdef12", auth.Identity{ID: "a", ExpiresAt: time.Now().Add(30 * time.Second)})
	if e != nil || token.CanPublish || token.ExpiresIn > 30 {
		t.Fatalf("token properties: %v", e)
	}
	raw, e := base64.RawURLEncoding.DecodeString(strings.Split(token.Token, ".")[1])
	if e != nil {
		t.Fatal(e)
	}
	var claims struct {
		Video    map[string]any
		Sub      string
		Metadata string
	}
	if e = json.Unmarshal(raw, &claims); e != nil {
		t.Fatal(e)
	}
	for _, key := range []string{"canPublish", "canSubscribe", "canPublishData", "canUpdateOwnMetadata"} {
		if claims.Video[key] != false {
			t.Fatalf("unsafe grant %s", key)
		}
	}
	if claims.Video["room"] != "abcdef12" || claims.Sub != "a" {
		t.Fatal("token scope")
	}
	store.change(func(r *debates.Room) { now := time.Now(); m := r.Members["a"]; m.DepartAt = &now; r.Members["a"] = m })
	if _, e = s.Issue(ctx, "abcdef12", auth.Identity{ID: "a", ExpiresAt: time.Now().Add(time.Hour)}); !errors.Is(e, debates.ErrForbidden) {
		t.Fatal("disconnected member received token")
	}
}
func TestPermissionOrderAndCleanup(t *testing.T) {
	store := fixtureStore()
	api := &fakeAPI{people: people(store)}
	s := NewWithAPI(store, api, "", "", "")
	ctx := context.Background()
	if e := s.Ensure(ctx, "abcdef12", 1); e != nil {
		t.Fatal(e)
	}
	for _, p := range api.people {
		if p.Permission.CanPublish != (p.Identity == "a") {
			t.Fatal("initial speaker grants")
		}
	}
	api.calls = nil
	store.change(func(r *debates.Room) { r.PhaseIndex = 1 })
	if e := s.Ensure(ctx, "abcdef12", 2); e != nil {
		t.Fatal(e)
	}
	if len(api.calls) != 2 || api.calls[0] != "update:a" || api.calls[1] != "update:b" {
		t.Fatalf("revoke before grant: %v", api.calls)
	}
	for _, p := range api.people {
		if p.Permission.CanPublish && (len(p.Permission.CanPublishSources) != 1 || p.Permission.CanPublishSources[0] != lk.TrackSource_MICROPHONE) {
			t.Fatal("non-audio publish")
		}
	}
	store.change(func(r *debates.Room) { r.Status = "voting" })
	if e := s.Ensure(ctx, "abcdef12", 3); e != nil {
		t.Fatal(e)
	}
	for _, p := range api.people {
		if p.Permission.CanPublish || !p.Permission.CanSubscribe {
			t.Fatal("voting must listen without publishing")
		}
	}
	store.change(func(r *debates.Room) { r.Status = "lobby"; r.DebateID = "" })
	if e := s.Ensure(ctx, "abcdef12", 4); e != nil {
		t.Fatal(e)
	}
	if api.calls[len(api.calls)-1] != "delete" {
		t.Fatal("cancel/reset must delete media")
	}
}
func TestFailuresExpiryAndConcurrentPhaseFailClosed(t *testing.T) {
	store := fixtureStore()
	api := &fakeAPI{people: people(store)}
	s := NewWithAPI(store, api, "", "", "")
	ctx := context.Background()
	api.fail = true
	if e := s.Ensure(ctx, "abcdef12", 1); !errors.Is(e, ErrUnavailable) {
		t.Fatal("provider failure reported success")
	}
	api.fail = false
	api.people[1].Metadata = "{}"
	api.after = func() { store.change(func(r *debates.Room) { r.PhaseIndex = 1 }) }
	if e := s.Ensure(ctx, "abcdef12", 1); !errors.Is(e, debates.ErrStale) {
		t.Fatalf("phase race: %v", e)
	}
	for _, p := range api.people {
		if p.Permission.CanPublish || p.Permission.CanSubscribe {
			t.Fatal("phase race retained grants")
		}
	}
	if !strings.Contains(strings.Join(api.calls, ","), "remove:b") {
		t.Fatal("expired/invalid lease not removed")
	}
	if e := s.Ensure(ctx, "11111111", 0); !errors.Is(e, debates.ErrNotFound) {
		t.Fatal("adopted unknown room")
	}
}
