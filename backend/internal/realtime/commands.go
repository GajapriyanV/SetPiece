package realtime

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/GajapriyanV/SetPiece/backend/internal/chat"
	"github.com/GajapriyanV/SetPiece/backend/internal/debates"
	"github.com/GajapriyanV/SetPiece/backend/internal/voting"
	"time"
)

func (h *Hub) command(c *client, cmd command, raw string) {
	if cached, ok := c.cache[cmd.RequestID]; ok {
		if cached.raw != raw {
			c.send(errorEnvelope(cmd.RequestID, chat.ErrConflict))
			return
		}
		if cmd.Type == "room:state" || cmd.Type == "room:join" {
			h.resync(c, cmd.RequestID)
		}
		c.send(cached.response)
		return
	}
	ctx, cancel := context.WithTimeout(c.ctx, 3*time.Second)
	defer cancel()
	result, e := h.execute(ctx, c, cmd)
	response := Envelope{Type: "ack", RequestID: cmd.RequestID, Data: result}
	if e != nil {
		response = errorEnvelope(cmd.RequestID, e)
	}
	// Transient failures can be retried; persist successful receipts on this
	// connection, while chat/vote have their own cross-connection receipts.
	if e == nil {
		encoded, _ := json.Marshal(response)
		size := len(raw) + len(encoded)
		for len(c.order) > 0 && (len(c.order) >= 128 || c.cacheBytes+size > 128<<10) {
			oldest := c.order[0]
			c.cacheBytes -= c.cache[oldest].size
			delete(c.cache, oldest)
			c.order = c.order[1:]
		}
		if size <= 128<<10 {
			c.cache[cmd.RequestID] = cachedReply{raw: raw, response: response, size: size}
			c.cacheBytes += size
			c.order = append(c.order, cmd.RequestID)
		}
	}
	c.send(response)
	if errors.Is(e, debates.ErrStale) {
		h.resync(c, "")
	}
}
func errorEnvelope(request string, e error) Envelope {
	code, message := "unavailable", "Room temporarily unavailable"
	switch {
	case errors.Is(e, debates.ErrInvalid), errors.Is(e, voting.ErrInvalid), errors.Is(e, chat.ErrInvalid):
		code, message = "invalid", "Invalid command"
	case errors.Is(e, debates.ErrForbidden), errors.Is(e, voting.ErrForbidden):
		code, message = "forbidden", "Room membership or vote eligibility required"
	case errors.Is(e, debates.ErrNotFound):
		code, message = "not_found", "Room not found"
	case errors.Is(e, debates.ErrStale):
		code, message = "stale", "Room changed; apply the latest snapshot"
	case errors.Is(e, debates.ErrConflict), errors.Is(e, voting.ErrConflict), errors.Is(e, chat.ErrConflict):
		code, message = "conflict", "Command conflicts with current state or an accepted request"
	case errors.Is(e, voting.ErrClosed):
		code, message = "closed", "Voting is closed"
	case errors.Is(e, chat.ErrRate):
		code, message = "rate_limited", "Please wait before sending again"
	case errors.Is(e, chat.ErrCapacity):
		code, message = "capacity", "Room capacity reached"
	}
	return Envelope{Type: "room:error", RequestID: request, Data: map[string]string{"code": code, "message": message}}
}
func empty(cmd command) bool { var v struct{}; return decode(cmd.Data, &v) == nil }
func (h *Hub) execute(ctx context.Context, c *client, cmd command) (any, error) {
	switch cmd.Type {
	case "room:create", "room:create_featured":
		topics := []debates.Topic{}
		if cmd.Type == "room:create" {
			var v debates.Topic
			if decode(cmd.Data, &v) != nil {
				return nil, debates.ErrInvalid
			}
			topics = append(topics, v)
		} else {
			var v struct {
				Topics []debates.Topic `json:"topics"`
			}
			if decode(cmd.Data, &v) != nil {
				return nil, debates.ErrInvalid
			}
			topics = v.Topics
		}
		if time.Since(c.lastCreate) < time.Minute {
			return nil, chat.ErrRate
		}
		room, e := h.rooms.Create(ctx, c.identity.ID, topics, cmd.Type == "room:create_featured")
		if e != nil {
			return nil, e
		}
		c.lastCreate = time.Now()
		result := map[string]any{"roomId": room.ID, "revision": room.Revision}
		c.send(Envelope{Type: "room:created", RequestID: cmd.RequestID, Data: result})
		return result, nil
	case "room:join":
		var v struct {
			RoomID string `json:"roomId"`
		}
		if decode(cmd.Data, &v) != nil || !roomPattern.MatchString(v.RoomID) {
			return nil, debates.ErrInvalid
		}
		if c.room != "" && c.room != v.RoomID {
			if e := h.leave(ctx, c, true); e != nil {
				return nil, e
			}
		}
		lock := h.stripe(v.RoomID)
		lock.Lock()
		defer lock.Unlock()
		h.mu.Lock()
		state := h.subscriptions[v.RoomID]
		if state == nil {
			if len(h.subscriptions) >= 128 {
				h.mu.Unlock()
				return nil, chat.ErrCapacity
			}
			state = &roomState{clients: map[*client]bool{}}
			h.subscriptions[v.RoomID] = state
		}
		h.mu.Unlock()
		room, e := h.rooms.Join(ctx, v.RoomID, c.identity.ID, c.id)
		if e != nil {
			h.mu.Lock()
			if len(state.clients) == 0 {
				delete(h.subscriptions, v.RoomID)
			}
			h.mu.Unlock()
			return nil, e
		}
		c.room = v.RoomID
		state.clients[c] = true
		if e = h.refresh(ctx, v.RoomID, c, cmd.RequestID); e != nil {
			return nil, e
		}
		return map[string]any{"roomId": room.ID, "revision": room.Revision}, nil
	case "room:leave":
		if !empty(cmd) {
			return nil, debates.ErrInvalid
		}
		return map[string]bool{"left": true}, h.leave(ctx, c, true)
	case "room:state":
		if !empty(cmd) {
			return nil, debates.ErrInvalid
		}
		if c.room == "" {
			return nil, debates.ErrForbidden
		}
		lock := h.stripe(c.room)
		lock.Lock()
		defer lock.Unlock()
		return map[string]bool{"synced": true}, h.sync(ctx, c, cmd.RequestID)
	}
	if c.room == "" {
		return nil, debates.ErrForbidden
	}
	lock := h.stripe(c.room)
	lock.Lock()
	defer lock.Unlock()
	var result any
	var e error
	switch cmd.Type {
	case "side:pick", "side:unpick", "side:ready", "featured:vote_skip":
		var v struct {
			Side     string `json:"side,omitempty"`
			Revision int64  `json:"revision"`
		}
		if decode(cmd.Data, &v) != nil || v.Revision < 1 || (cmd.Type == "side:pick" && v.Side != "a" && v.Side != "b") || (cmd.Type != "side:pick" && v.Side != "") {
			return nil, debates.ErrInvalid
		}
		kind := "pick"
		if cmd.Type == "side:ready" {
			kind = "ready"
		}
		if cmd.Type == "featured:vote_skip" {
			kind = "skip"
		}
		var room debates.Room
		room, e = h.rooms.Command(ctx, c.room, c.identity.ID, kind, v.Side, v.Revision)
		result = map[string]any{"roomId": room.ID, "revision": room.Revision}
	case "vote:cast":
		var v struct {
			Side     string `json:"side"`
			DebateID string `json:"debateId"`
		}
		if decode(cmd.Data, &v) != nil || v.DebateID == "" {
			return nil, debates.ErrInvalid
		}
		view, err := h.source.Read(ctx, c.room)
		if err != nil {
			return nil, err
		}
		if _, ok := view.Room.Members[c.identity.ID]; !ok {
			return nil, debates.ErrForbidden
		}
		if view.Room.DebateID != v.DebateID {
			return nil, debates.ErrStale
		}
		result, e = h.votes.Cast(ctx, v.DebateID, c.identity, v.Side)
	case "chat:send":
		var v struct {
			Body string `json:"body"`
		}
		if decode(cmd.Data, &v) != nil {
			return nil, chat.ErrInvalid
		}
		view, err := h.source.Read(ctx, c.room)
		if err != nil {
			return nil, err
		}
		m, ok := view.Room.Members[c.identity.ID]
		if !ok || m.DepartAt != nil || view.Room.Status == "closed" {
			return nil, debates.ErrForbidden
		}
		h.mu.Lock()
		state := h.subscriptions[c.room]
		h.mu.Unlock()
		if state == nil {
			return nil, debates.ErrForbidden
		}
		if err = h.publish(ctx, c.room, state, view, nil, ""); err != nil {
			return nil, err
		}
		message, fresh, err := h.chat.Send(c.room, c.identity.ID, view.brief(c.identity.ID).Username, cmd.RequestID, v.Body)
		if err != nil {
			return nil, err
		}
		if fresh {
			for subscriber := range state.clients {
				subscriber.send(Envelope{Type: "chat:message", RoomID: c.room, Revision: view.Room.Revision, Data: message})
			}
		}
		return message, nil
	default:
		return nil, debates.ErrInvalid
	}
	if e != nil {
		return nil, e
	}
	// A notification failure never changes a committed command into a failure.
	// The revision poll retries; clients can explicitly request room:state.
	_ = h.refresh(ctx, c.room, nil, "")
	return result, nil
}
func (h *Hub) sync(ctx context.Context, c *client, request string) error {
	if e := h.refresh(ctx, c.room, nil, ""); e != nil {
		return e
	}
	h.mu.Lock()
	state := h.subscriptions[c.room]
	h.mu.Unlock()
	if state == nil || state.view == nil {
		return debates.ErrForbidden
	}
	v := state.view
	if _, ok := v.Room.Members[c.identity.ID]; !ok {
		return debates.ErrForbidden
	}
	c.send(Envelope{Type: "room:state_sync", RequestID: request, RoomID: c.room, Revision: v.Room.Revision, Data: map[string]any{"state": v.snapshot(c.identity.ID, h.chat.History(c.room), time.Now())}})
	return nil
}
func (h *Hub) resync(c *client, request string) {
	if c.room == "" {
		return
	}
	lock := h.stripe(c.room)
	lock.Lock()
	defer lock.Unlock()
	ctx, cancel := context.WithTimeout(c.ctx, 3*time.Second)
	defer cancel()
	_ = h.sync(ctx, c, request)
}
