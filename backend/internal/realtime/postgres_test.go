package realtime

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/GajapriyanV/SetPiece/backend/internal/debates"
	"github.com/GajapriyanV/SetPiece/backend/internal/httpapi"
	"github.com/GajapriyanV/SetPiece/backend/internal/voting"
	"github.com/coder/websocket"
	"github.com/jackc/pgx/v5/pgxpool"
)

type retryRooms struct {
	Rooms
	fail atomic.Bool
}

func (r *retryRooms) Disconnect(ctx context.Context, room, user, connection string, explicit bool) (debates.Room, error) {
	if r.fail.Swap(false) {
		return debates.Room{}, errors.New("temporary database outage")
	}
	return r.Rooms.Disconnect(ctx, room, user, connection, explicit)
}

type wireEvent struct {
	Type      string          `json:"type"`
	RequestID string          `json:"requestId"`
	Revision  int64           `json:"revision"`
	Sequence  uint64          `json:"sequence"`
	Data      json.RawMessage `json:"data"`
}
type wireClient struct {
	ws       *websocket.Conn
	events   chan wireEvent
	ctx      context.Context
	next     int
	seen     map[string]bool
	sequence uint64
	state    map[string]any
}

func (w *wireClient) receive(t *testing.T) wireEvent {
	t.Helper()
	select {
	case e, ok := <-w.events:
		if !ok {
			t.Fatal("socket closed")
		}
		if e.Sequence <= w.sequence {
			t.Fatal("out of order event")
		}
		w.sequence = e.Sequence
		w.seen[e.Type] = true
		if e.Type == "room:joined" || e.Type == "room:state_sync" {
			var data struct{ State map[string]any }
			if json.Unmarshal(e.Data, &data) != nil {
				t.Fatal("bad snapshot")
			}
			w.state = data.State
		}
		return e
	case <-time.After(5 * time.Second):
		t.Fatal("event timeout")
		return wireEvent{}
	}
}
func (w *wireClient) command(t *testing.T, kind string, data any) wireEvent {
	t.Helper()
	w.next++
	id := fmt.Sprintf("r%d", w.next)
	body, _ := json.Marshal(Envelope{Version: 1, Type: kind, RequestID: id, Data: data})
	if e := w.ws.Write(w.ctx, websocket.MessageText, body); e != nil {
		t.Fatal(e)
	}
	for {
		e := w.receive(t)
		if e.RequestID == id && (e.Type == "ack" || e.Type == "room:error") {
			return e
		}
	}
}
func (w *wireClient) ok(t *testing.T, kind string, data any) wireEvent {
	t.Helper()
	e := w.command(t, kind, data)
	if e.Type != "ack" {
		t.Fatalf("%s: %s", kind, e.Data)
	}
	return e
}
func (w *wireClient) untilStatus(t *testing.T, status string) {
	t.Helper()
	for w.state == nil || w.state["status"] != status {
		w.receive(t)
	}
}
func TestPostgresSocketLifecycle(t *testing.T) {
	uri := os.Getenv("SETPIECE_REALTIME_TEST_DATABASE_URL")
	if uri == "" {
		t.Skip("isolated realtime database not configured")
	}
	u, e := url.Parse(uri)
	if e != nil || u.Hostname() != "127.0.0.1" || !strings.HasPrefix(strings.TrimPrefix(u.Path, "/"), "setpiece_m2_test_") || len(u.Query()) != 1 || u.Query().Get("sslmode") != "disable" {
		t.Fatal("fresh loopback setpiece_m2_test_* required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	pool, e := pgxpool.New(ctx, uri)
	if e != nil {
		t.Fatal(e)
	}
	defer pool.Close()
	var existing *string
	if e = pool.QueryRow(ctx, "SELECT to_regclass('public.profiles')::text").Scan(&existing); e != nil || existing != nil {
		t.Fatal("fixture must be empty")
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
	for i := 1; i <= 4; i++ {
		id := fmt.Sprintf("00000000-0000-4000-8000-%012d", i)
		ids = append(ids, id)
		if _, e = pool.Exec(ctx, "INSERT INTO auth.users(id) VALUES($1)", id); e != nil {
			t.Fatal(e)
		}
		if _, e = pool.Exec(ctx, "INSERT INTO public.profiles(id,username) VALUES($1,$2)", id, fmt.Sprintf("speaker%d", i)); e != nil {
			t.Fatal(e)
		}
	}
	var clock atomic.Int64
	clock.Store(time.Now().UnixNano())
	now := func() time.Time { return time.Unix(0, clock.Load()) }
	repo := debates.NewPostgres(pool)
	rooms := debates.NewService(repo, now, 15*time.Second)
	votes := voting.NewService(pool)
	source := NewPostgresSource(pool)
	retry := &retryRooms{Rooms: rooms}
	mediaService := localMediaService(t, pool)
	var gates []Gate
	var mediaAPI httpapi.MediaService
	if mediaService != nil {
		gates = append(gates, mediaService.Ensure)
		mediaAPI = mediaService
	}
	h := New(retry, votes, source, fakeAuth{}, []string{"https://client"}, gates...)
	server := httptest.NewServer(httpapi.New(httpapi.Dependencies{Media: mediaAPI, Directory: repo, Realtime: h, Rooms: rooms, Voting: votes, Auth: fakeAuth{}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), AllowedOrigins: []string{"https://client"}, RequestTimeout: time.Second}))
	defer server.Close()
	defer h.Close()
	connect := func(user string) *wireClient {
		t.Helper()
		// Skip only the issuance throttle to create multiple tabs immediately.
		h.tickets.Lock()
		delete(h.tickets.issued, user)
		h.tickets.Unlock()
		request, _ := http.NewRequestWithContext(ctx, "POST", server.URL+"/api/realtime/ticket", nil)
		request.Header.Set("Origin", "https://client")
		request.Header.Set("Authorization", "Bearer "+user)
		response, e := http.DefaultClient.Do(request)
		if e != nil {
			t.Fatal(e)
		}
		var ticket struct{ Ticket string }
		_ = json.NewDecoder(response.Body).Decode(&ticket)
		response.Body.Close()
		if response.StatusCode != 200 {
			t.Fatal(response.StatusCode)
		}
		ws, _, e := websocket.Dial(ctx, "ws"+strings.TrimPrefix(server.URL, "http")+"/api/realtime/ws?ticket="+ticket.Ticket, &websocket.DialOptions{HTTPHeader: http.Header{"Origin": []string{"https://client"}}})
		if e != nil {
			t.Fatal(e)
		}
		w := &wireClient{ws: ws, ctx: ctx, events: make(chan wireEvent, 512), seen: map[string]bool{}}
		go func() {
			defer close(w.events)
			for {
				_, data, e := ws.Read(ctx)
				if e != nil {
					return
				}
				var event wireEvent
				if json.Unmarshal(data, &event) != nil {
					return
				}
				select {
				case w.events <- event:
				case <-ctx.Done():
					return
				}
			}
		}()
		t.Cleanup(func() { _ = ws.CloseNow() })
		return w
	}
	a, b, s := connect(ids[0]), connect(ids[1]), connect(ids[2])
	event := a.ok(t, "room:create", map[string]string{"topic": "Transport fixture", "sideALabel": "A", "sideBLabel": "B"})
	var created struct{ RoomID string }
	_ = json.Unmarshal(event.Data, &created)
	room := created.RoomID
	event = b.ok(t, "room:create_featured", map[string]any{"topics": []debates.Topic{{Topic: "Featured 1", SideA: "A", SideB: "B"}, {Topic: "Featured 2", SideA: "A", SideB: "B"}}})
	var featured struct{ RoomID string }
	_ = json.Unmarshal(event.Data, &featured)
	for _, w := range []*wireClient{a, b, s} {
		w.ok(t, "room:join", map[string]string{"roomId": room})
	}
	// Directory is a bounded public projection, using the same committed membership.
	page, cursor, e := repo.PublicPage(ctx, "", 1)
	if e != nil || len(page) != 1 || cursor == "" {
		t.Fatalf("first directory page: %v", e)
	}
	page2, cursor2, e := repo.PublicPage(ctx, cursor, 1)
	if e != nil || len(page2) != 1 || cursor2 != "" || page2[0].ID == page[0].ID {
		t.Fatalf("second directory page: %v", e)
	}
	count, e := repo.LiveCount(ctx)
	if e != nil || count != 3 {
		t.Fatalf("live count %d: %v", count, e)
	}
	for _, entry := range append(page, page2...) {
		if entry.ID == room && (entry.MemberCount != 3 || entry.Topic != "Transport fixture" || entry.SideA != "A") {
			t.Fatal("directory projection mismatch")
		}
	}
	response, e := http.Get(server.URL + "/api/rooms/stats")
	if e != nil {
		t.Fatal(e)
	}
	var stats struct{ DebatingNow int }
	_ = json.NewDecoder(response.Body).Decode(&stats)
	response.Body.Close()
	if response.StatusCode != 200 || stats.DebatingNow != 3 {
		t.Fatal("public stats")
	}
	revision := func(id string) int64 {
		r, e := repo.Read(ctx, id)
		if e != nil {
			t.Fatal(e)
		}
		return r.Revision
	}
	pick := func(w *wireClient, side string) {
		w.ok(t, "side:pick", map[string]any{"side": side, "revision": revision(room)})
	}
	pick(a, "a")
	a.ok(t, "side:unpick", map[string]any{"revision": revision(room)})
	pick(a, "a")
	pick(b, "b")
	s.ok(t, "chat:send", map[string]string{"body": "  hello audience  "})
	s.ok(t, "room:state", map[string]any{})
	if len(s.state["chat"].([]any)) != 1 {
		t.Fatal("chat snapshot")
	}
	if e := s.command(t, "side:pick", map[string]any{"side": "a", "revision": 1}); e.Type != "room:error" {
		t.Fatal("stale command accepted")
	}
	// Another tab keeps user membership alive through both explicit and abrupt leaves.
	tab := connect(ids[0])
	tab.ok(t, "room:join", map[string]string{"roomId": room})
	a.ok(t, "room:leave", map[string]any{})
	r, e := repo.Read(ctx, room)
	if e != nil || r.Members[ids[0]].DepartAt != nil || len(r.Members) != 3 {
		t.Fatal("multi-tab leave removed member")
	}
	a.ok(t, "room:join", map[string]string{"roomId": room})
	_ = tab.ws.CloseNow()
	deadline := time.Now().Add(3 * time.Second)
	for {
		h.mu.Lock()
		n := len(h.clients)
		h.mu.Unlock()
		if n == 3 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("abrupt tab cleanup")
		}
		time.Sleep(5 * time.Millisecond)
	}
	r, _ = repo.Read(ctx, room)
	if r.Members[ids[0]].DepartAt != nil {
		t.Fatal("multi-tab disconnect")
	}
	a.ok(t, "side:ready", map[string]any{"revision": revision(room)})
	b.ok(t, "side:ready", map[string]any{"revision": revision(room)})
	s.ok(t, "room:state", map[string]any{})
	if s.state["status"] != "countdown" || s.state["countdownEndsAt"] == nil || s.state["debateId"] == nil {
		t.Fatal("countdown recovery")
	}
	r, _ = repo.Read(ctx, room)
	clock.Store(r.Deadline.UnixNano())
	if _, e = rooms.Tick(ctx, room, r.Revision); e != nil {
		t.Fatal(e)
	}
	s.untilStatus(t, "live")
	s.ok(t, "room:state", map[string]any{})
	if s.state["phase"] == nil {
		t.Fatal("live recovery")
	}
	var mediaPeers *mediaFixture
	if mediaService != nil {
		mediaPeers = connectMediaFixture(t, ctx, server.URL, room, ids[:3])
		mediaPeers.phase(t, 0)
		mediaPeers.audio(t, 0)
	}
	// Drive all six phase deadlines without sleeping through a full debate.
	for i := 0; i < 6; i++ {
		r, _ = repo.Read(ctx, room)
		clock.Store(r.Deadline.UnixNano())
		if _, e = rooms.Tick(ctx, room, r.Revision); e != nil {
			t.Fatal(e)
		}
		if mediaPeers != nil {
			s.ok(t, "room:state", map[string]any{})
			mediaPeers.phase(t, i+1)
			if i == 0 {
				mediaPeers.audio(t, 1)
			}
		}
	}
	s.untilStatus(t, "voting")
	s.ok(t, "room:state", map[string]any{})
	debate := s.state["debateId"].(string)
	if s.state["votingEndsAt"] == nil {
		t.Fatal("voting deadline")
	}
	if e := a.command(t, "vote:cast", map[string]string{"side": "a", "debateId": debate}); e.Type != "room:error" {
		t.Fatal("speaker voted")
	}
	s.ok(t, "vote:cast", map[string]string{"side": "a", "debateId": debate})
	s.ok(t, "vote:cast", map[string]string{"side": "a", "debateId": debate})
	if e := s.command(t, "vote:cast", map[string]string{"side": "b", "debateId": debate}); e.Type != "room:error" {
		t.Fatal("vote switched")
	}
	s.ok(t, "room:state", map[string]any{})
	if s.state["ownVote"] != "a" {
		t.Fatal("own vote missing")
	}
	// Full reconnect obtains the durable receipt and totals without replaying commands.
	reconnect := connect(ids[2])
	reconnect.ok(t, "room:join", map[string]string{"roomId": room})
	if reconnect.state["ownVote"] != "a" {
		t.Fatal("receipt lost on refresh")
	}
	reconnect.ok(t, "room:leave", map[string]any{})
	if _, e = repo.Update(ctx, room, func(r *debates.Room) error { at := time.Now().Add(-time.Second); r.Deadline = &at; return nil }); e != nil {
		t.Fatal(e)
	}
	clock.Store(time.Now().UnixNano())
	if _, e = votes.Finalize(ctx, debate); e != nil {
		t.Fatal(e)
	}
	s.untilStatus(t, "results")
	s.ok(t, "room:state", map[string]any{})
	if s.state["results"] == nil {
		t.Fatal("results recovery")
	}
	// Room switching must explicitly leave only the switching connection.
	s.ok(t, "room:join", map[string]string{"roomId": featured.RoomID})
	b.ok(t, "room:join", map[string]string{"roomId": featured.RoomID})
	s.ok(t, "room:state", map[string]any{})
	if s.state["sidePickEndsAt"] == nil || s.state["featuredMeta"] == nil {
		t.Fatal("featured recovery")
	}
	s.ok(t, "featured:vote_skip", map[string]any{"revision": revision(featured.RoomID)})
	b.ok(t, "featured:vote_skip", map[string]any{"revision": revision(featured.RoomID)})
	s.ok(t, "room:state", map[string]any{})
	if s.state["topic"] != "Featured 1" && s.state["topic"] != "Featured 2" {
		t.Fatal("topic")
	}
	// Last connection loss persists a deadline; rejoin clears it. Expiry removes it.
	retry.fail.Store(true)
	_ = s.ws.CloseNow()
	deadline = time.Now().Add(3 * time.Second)
	for {
		r, _ = repo.Read(ctx, featured.RoomID)
		if r.Members[ids[2]].DepartAt != nil {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("disconnect deadline")
		}
		time.Sleep(5 * time.Millisecond)
	}
	recovered := connect(ids[2])
	recovered.ok(t, "room:join", map[string]string{"roomId": featured.RoomID})
	r, _ = repo.Read(ctx, featured.RoomID)
	if r.Members[ids[2]].DepartAt != nil {
		t.Fatal("reconnect didn't clear deadline")
	}
	_ = recovered.ws.CloseNow()
	deadline = time.Now().Add(3 * time.Second)
	for {
		r, _ = repo.Read(ctx, featured.RoomID)
		if r.Members[ids[2]].DepartAt != nil {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("disconnect")
		}
		time.Sleep(5 * time.Millisecond)
	}
	clock.Store(r.Members[ids[2]].DepartAt.Add(time.Second).UnixNano())
	if _, e = rooms.Tick(ctx, featured.RoomID, r.Revision); e != nil {
		t.Fatal(e)
	}
	r, _ = repo.Read(ctx, featured.RoomID)
	if _, ok := r.Members[ids[2]]; ok {
		t.Fatal("grace didn't expire")
	}
	// A new user never inherits somebody else's accepted vote.
	view, e := source.Read(ctx, room)
	if e != nil || view.OwnVotes[ids[0]] != "" || view.VotesA != 1 || view.Result == nil {
		t.Fatal("snapshot isolation", e)
	}
	// Returning to the lobby removes the prior LiveKit room, after durable results.
	if mediaPeers != nil {
		r, _ = repo.Read(ctx, room)
		clock.Store(r.Deadline.UnixNano())
		if _, e = rooms.Tick(ctx, room, r.Revision); e != nil {
			t.Fatal(e)
		}
		a.ok(t, "room:state", map[string]any{})
		if a.state["status"] != "lobby" {
			t.Fatal("did not return to lobby")
		}
		mediaPeers.deleted(t)
	}
	h.Close()
	h.mu.Lock()
	remaining := len(h.clients)
	h.mu.Unlock()
	if remaining != 0 {
		t.Fatal("shutdown retained clients")
	}
}
