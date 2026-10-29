// Package chat preserves ephemeral room history; it never writes application tables.
package chat

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf16"
)

var ErrInvalid = errors.New("invalid chat message")
var ErrRate = errors.New("chat rate limited")
var ErrConflict = errors.New("request ID reused")
var ErrCapacity = errors.New("chat capacity reached")

type Message struct {
	ID        string    `json:"id"`
	UserID    string    `json:"userId"`
	Username  string    `json:"username"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"createdAt"`
}
type receipt struct {
	Message
	request string
}
type history struct {
	messages []receipt
	touched  time.Time
}
type Service struct {
	mu    sync.Mutex
	rooms map[string]*history
	last  map[string]time.Time
	now   func() time.Time
}

func New(now func() time.Time) *Service {
	if now == nil {
		now = time.Now
	}
	return &Service{rooms: map[string]*history{}, last: map[string]time.Time{}, now: now}
}

// Send returns whether this is a new message. Receipts last for the retained 200
// messages (and at most 45 idle minutes); retrying older messages is not safe.
func (s *Service) Send(room, user, name, request, body string) (Message, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	s.prune(now)
	body = strings.TrimFunc(body, func(r rune) bool { return r == '\uFEFF' || (unicode.IsSpace(r) && r != '\u0085') })
	if room == "" || user == "" || request == "" || len(request) > 64 || body == "" || len(utf16.Encode([]rune(body))) > 280 {
		return Message{}, false, ErrInvalid
	}
	h := s.rooms[room]
	if h != nil {
		for _, m := range h.messages {
			if m.UserID == user && m.request == request {
				if m.Body != body {
					return Message{}, false, ErrConflict
				}
				return m.Message, false, nil
			}
		}
	}
	if at, ok := s.last[user]; ok && now.Sub(at) < time.Second {
		return Message{}, false, ErrRate
	}
	if h == nil {
		if len(s.rooms) >= 128 {
			return Message{}, false, ErrCapacity
		}
		h = &history{}
		s.rooms[room] = h
	}
	if len(s.last) >= 4096 {
		return Message{}, false, ErrCapacity
	}
	var id [16]byte
	if _, e := rand.Read(id[:]); e != nil {
		return Message{}, false, e
	}
	m := Message{hex.EncodeToString(id[:]), user, name, body, now}
	s.last[user] = now
	h.touched = now
	h.messages = append(h.messages, receipt{m, request})
	if len(h.messages) > 200 {
		copy(h.messages, h.messages[len(h.messages)-200:])
		h.messages = h.messages[:200]
	}
	return m, true, nil
}
func (s *Service) History(room string) []Message {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.prune(s.now())
	out := []Message{}
	h := s.rooms[room]
	if h == nil {
		return out
	}
	start := len(h.messages) - 50
	if start < 0 {
		start = 0
	}
	for _, m := range h.messages[start:] {
		out = append(out, m.Message)
	}
	return out
}
func (s *Service) Forget(room string) { s.mu.Lock(); defer s.mu.Unlock(); delete(s.rooms, room) }
func (s *Service) prune(now time.Time) {
	for id, at := range s.last {
		if now.Sub(at) >= time.Second {
			delete(s.last, id)
		}
	}
	for id, h := range s.rooms {
		if now.Sub(h.touched) >= 45*time.Minute {
			delete(s.rooms, id)
		}
	}
}
