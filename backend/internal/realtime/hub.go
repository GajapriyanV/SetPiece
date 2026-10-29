// Package realtime adapts authenticated standard WebSockets to shared services.
package realtime

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"hash/fnv"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/GajapriyanV/SetPiece/backend/internal/auth"
	"github.com/GajapriyanV/SetPiece/backend/internal/chat"
	"github.com/GajapriyanV/SetPiece/backend/internal/debates"
	"github.com/GajapriyanV/SetPiece/backend/internal/voting"
	"github.com/coder/websocket"
)

type Verifier interface {
	Verify(context.Context, string) (auth.Identity, error)
}
type Rooms interface {
	Create(context.Context, string, []debates.Topic, bool) (debates.Room, error)
	Join(context.Context, string, string, string) (debates.Room, error)
	Disconnect(context.Context, string, string, string, bool) (debates.Room, error)
	Command(context.Context, string, string, string, string, int64) (debates.Room, error)
}
type Votes interface {
	Cast(context.Context, string, auth.Identity, string) (voting.State, error)
}
type roomState struct {
	view    *View
	clients map[*client]bool
}
type Gate func(context.Context, string, int64) error
type Hub struct {
	gate          Gate
	rooms         Rooms
	votes         Votes
	source        Source
	auth          Verifier
	chat          *chat.Service
	origins       map[string]bool
	tickets       *tickets
	ctx           context.Context
	cancel        context.CancelFunc
	done          chan struct{}
	handlers      sync.WaitGroup
	mu            sync.Mutex
	clients       map[*client]bool
	subscriptions map[string]*roomState
	stripes       [64]sync.Mutex
}
type cachedReply struct {
	raw      string
	response Envelope
	size     int
}
type client struct {
	hub         *Hub
	ws          *websocket.Conn
	identity    auth.Identity
	id          string
	ctx         context.Context
	cancel      context.CancelFunc
	out         chan []byte
	op          sync.Mutex
	room        string
	cache       map[string]cachedReply
	cacheBytes  int
	order       []string
	sendMu      sync.Mutex
	sequence    uint64
	queuedBytes int
	tokens      float64
	last        time.Time
	lastCreate  time.Time
}

func New(rooms Rooms, votes Votes, source Source, auth Verifier, origins []string, gates ...Gate) *Hub {
	ctx, cancel := context.WithCancel(context.Background())
	h := &Hub{rooms: rooms, votes: votes, source: source, auth: auth, chat: chat.New(nil), origins: map[string]bool{}, tickets: newTickets(), ctx: ctx, cancel: cancel, done: make(chan struct{}), clients: map[*client]bool{}, subscriptions: map[string]*roomState{}}
	for _, o := range origins {
		h.origins[o] = true
	}
	if len(gates) > 0 {
		h.gate = gates[0]
	}
	go h.run()
	return h
}
func (h *Hub) Close() {
	h.cancel()
	h.mu.Lock()
	clients := []*client{}
	for c := range h.clients {
		clients = append(clients, c)
	}
	h.mu.Unlock()
	for _, c := range clients {
		c.cancel()
	}
	<-h.done
	h.handlers.Wait()
}
func (h *Hub) stripe(room string) *sync.Mutex {
	f := fnv.New32a()
	_, _ = f.Write([]byte(room))
	return &h.stripes[f.Sum32()%64]
}
func fail(w http.ResponseWriter, code int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}
func (h *Hub) Ticket(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	origin := r.Header.Get("Origin")
	if r.Method != "POST" {
		fail(w, 405, "Method not allowed")
		return
	}
	if origin == "" || !h.origins[origin] {
		fail(w, 403, "Origin not allowed")
		return
	}
	fields := strings.Fields(r.Header.Get("Authorization"))
	if len(fields) != 2 || !strings.EqualFold(fields[0], "Bearer") {
		fail(w, 401, "Authentication required")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	id, e := h.auth.Verify(ctx, fields[1])
	if e != nil {
		code := 401
		if errors.Is(e, auth.ErrUnavailable) {
			code = 503
		}
		fail(w, code, "Authentication unavailable")
		return
	}
	if !time.Now().Before(id.ExpiresAt) {
		fail(w, 401, "Authentication expired")
		return
	}
	token, ok := h.tickets.issue(id, origin, time.Now())
	if !ok {
		fail(w, 429, "Ticket unavailable; retry shortly")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ticket": token, "expiresIn": 30, "protocolVersion": 1})
}
func (h *Hub) Upgrade(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if r.Method != "GET" || origin == "" || !h.origins[origin] {
		fail(w, 403, "Origin not allowed")
		return
	}
	q := r.URL.Query()
	if len(q) != 1 || len(q["ticket"]) != 1 || len(q.Get("ticket")) != 43 {
		fail(w, 401, "Invalid ticket")
		return
	}
	id, ok := h.tickets.consume(q.Get("ticket"), origin, time.Now())
	if !ok {
		fail(w, 401, "Invalid ticket")
		return
	}
	// Reserve capacity before upgrading, so concurrent handshakes cannot exceed it.
	h.mu.Lock()
	n := 0
	for c := range h.clients {
		if c.identity.ID == id.ID {
			n++
		}
	}
	if len(h.clients) >= 512 || n >= 8 || h.ctx.Err() != nil {
		h.mu.Unlock()
		fail(w, 503, "Connection capacity reached")
		return
	}
	var b [16]byte
	_, _ = rand.Read(b[:])
	ctx, cancel := context.WithDeadline(h.ctx, id.ExpiresAt)
	c := &client{hub: h, identity: id, id: hex.EncodeToString(b[:]), ctx: ctx, cancel: cancel, out: make(chan []byte, 64), cache: map[string]cachedReply{}, tokens: 40, last: time.Now()}
	h.clients[c] = true
	h.handlers.Add(1)
	h.mu.Unlock()
	defer h.handlers.Done()
	// Exact scheme/host origins were validated above; no wildcard library policy.
	ws, e := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true, CompressionMode: websocket.CompressionDisabled})
	if e != nil {
		cancel()
		h.mu.Lock()
		delete(h.clients, c)
		h.mu.Unlock()
		return
	}
	c.op.Lock()
	c.ws = ws
	c.op.Unlock()
	ws.SetReadLimit(16 << 10)
	defer func() { cancel(); _ = ws.CloseNow(); h.cleanup(c) }()
	go c.write()
	for {
		kind, data, e := ws.Read(ctx)
		if e != nil {
			return
		}
		if kind != websocket.MessageText {
			return
		}
		c.op.Lock()
		now := time.Now()
		c.tokens += now.Sub(c.last).Seconds() * 20
		if c.tokens > 40 {
			c.tokens = 40
		}
		c.last = now
		if c.tokens < 1 {
			c.op.Unlock()
			return
		}
		c.tokens--
		cmd, e := parse(data)
		if e != nil {
			c.send(Envelope{Type: "room:error", RequestID: safeRequest(cmd.RequestID), Data: map[string]string{"code": "invalid", "message": "Invalid command"}})
		} else {
			h.command(c, cmd, string(data))
		}
		c.op.Unlock()
	}
}
func safeRequest(id string) string {
	if requestPattern.MatchString(id) {
		return id
	}
	return ""
}
func (c *client) send(e Envelope) {
	c.sendMu.Lock()
	defer c.sendMu.Unlock()
	if c.ctx.Err() != nil {
		return
	}
	c.sequence++
	e.Version = 1
	e.Sequence = c.sequence
	data, err := json.Marshal(e)
	if err != nil || len(data) > 256<<10 || c.queuedBytes+len(data) > 256<<10 {
		c.cancel()
		return
	}
	select {
	case c.out <- data:
		c.queuedBytes += len(data)
	default:
		c.cancel()
	}
}
func (c *client) write() {
	defer c.cancel()
	defer c.ws.CloseNow()
	heartbeat := time.NewTicker(20 * time.Second)
	defer heartbeat.Stop()
	for {
		select {
		case <-c.ctx.Done():
			return
		case data := <-c.out:
			if data == nil {
				return
			}
			c.sendMu.Lock()
			c.queuedBytes -= len(data)
			c.sendMu.Unlock()
			ctx, cancel := context.WithTimeout(c.ctx, 5*time.Second)
			e := c.ws.Write(ctx, websocket.MessageText, data)
			cancel()
			if e != nil {
				return
			}
		case <-heartbeat.C:
			ctx, cancel := context.WithTimeout(c.ctx, 5*time.Second)
			e := c.ws.Ping(ctx)
			cancel()
			if e != nil {
				return
			}
		}
	}
}
func (h *Hub) cleanup(c *client) {
	c.op.Lock()
	defer c.op.Unlock()
	// Reserved handshakes are removed by their own handler.
	if c.ws == nil {
		return
	}
	if c.room != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		e := h.leave(ctx, c, false)
		cancel()
		if e != nil {
			return
		}
	}
	h.mu.Lock()
	delete(h.clients, c)
	h.mu.Unlock()
}
func (h *Hub) leave(ctx context.Context, c *client, explicit bool) error {
	id := c.room
	if id == "" {
		return nil
	}
	lock := h.stripe(id)
	lock.Lock()
	defer lock.Unlock()
	_, e := h.rooms.Disconnect(ctx, id, c.identity.ID, c.id, explicit)
	if e != nil && !errors.Is(e, debates.ErrNotFound) {
		return e
	}
	h.mu.Lock()
	state := h.subscriptions[id]
	if state != nil {
		delete(state.clients, c)
		if len(state.clients) == 0 {
			delete(h.subscriptions, id)
		}
	}
	h.mu.Unlock()
	c.room = ""
	if state != nil && len(state.clients) > 0 {
		_ = h.refresh(ctx, id, nil, "")
	}
	return nil
}
func (h *Hub) run() {
	defer close(h.done)
	ticks := time.NewTicker(250 * time.Millisecond)
	defer ticks.Stop()
	for {
		select {
		case <-h.ctx.Done():
			return
		case <-ticks.C:
			h.mu.Lock()
			versions := map[string]int64{}
			dead := []*client{}
			for id, s := range h.subscriptions {
				if s.view != nil {
					versions[id] = s.view.Room.Revision
				} else {
					versions[id] = 0
				}
			}
			for c := range h.clients {
				if c.ctx.Err() != nil {
					dead = append(dead, c)
				}
			}
			h.mu.Unlock()
			for _, c := range dead {
				if h.ctx.Err() != nil {
					return
				}
				h.cleanup(c)
			}
			if len(versions) == 0 {
				continue
			}
			ctx, cancel := context.WithTimeout(h.ctx, 3*time.Second)
			ids, e := h.source.Changed(ctx, versions)
			cancel()
			if e != nil {
				continue
			}
			for _, id := range ids {
				lock := h.stripe(id)
				lock.Lock()
				ctx, cancel := context.WithTimeout(h.ctx, 3*time.Second)
				_ = h.refresh(ctx, id, nil, "")
				cancel()
				lock.Unlock()
				if h.ctx.Err() != nil {
					return
				}
			}
		}
	}
}

// Called with the room stripe held. Queries never run while holding hub.mu.
func (h *Hub) refresh(ctx context.Context, id string, direct *client, request string) error {
	h.mu.Lock()
	state := h.subscriptions[id]
	h.mu.Unlock()
	if state == nil {
		return nil
	}
	view, e := h.source.Read(ctx, id)
	if e != nil {
		return e
	}
	return h.publish(ctx, id, state, view, direct, request)
}
func (h *Hub) publish(ctx context.Context, id string, state *roomState, view View, direct *client, request string) error {
	if h.gate != nil {
		if e := h.gate(ctx, id, view.Room.Revision); e != nil {
			return e
		}
	}
	old := state.view
	if old != nil && view.Room.Revision < old.Room.Revision {
		return debates.ErrStale
	}
	history := h.chat.History(id)
	now := time.Now()
	if old == nil || view.Room.Revision != old.Room.Revision {
		events := []Envelope{}
		if old != nil {
			events = changes(*old, view, now)
		}
		for c := range state.clients {
			_, member := view.Room.Members[c.identity.ID]
			if !member && view.Room.Status != "closed" {
				c.send(Envelope{Type: "room:closed", RoomID: id, Revision: view.Room.Revision, Data: map[string]string{"reason": "Membership ended"}})
				c.finish()
				continue
			}
			for _, event := range events {
				c.send(event)
			}
			kind := "room:state_sync"
			req := ""
			if c == direct {
				kind = "room:joined"
				req = request
			}
			c.send(Envelope{Type: kind, RequestID: req, RoomID: id, Revision: view.Room.Revision, Data: map[string]any{"roomId": id, "state": view.snapshot(c.identity.ID, history, now)}})
		}
		h.mu.Lock()
		state.view = &view
		h.mu.Unlock()
	} else if direct != nil {
		direct.send(Envelope{Type: "room:joined", RequestID: request, RoomID: id, Revision: view.Room.Revision, Data: map[string]any{"roomId": id, "state": view.snapshot(direct.identity.ID, history, now)}})
	}
	if view.Room.Status == "closed" {
		h.chat.Forget(id)
		for c := range state.clients {
			c.finish()
		}
	}
	return nil
}

// A sentinel closes only after queued terminal events have been written.
func (c *client) finish() {
	c.sendMu.Lock()
	defer c.sendMu.Unlock()
	select {
	case c.out <- nil:
	default:
		c.cancel()
	}
}
