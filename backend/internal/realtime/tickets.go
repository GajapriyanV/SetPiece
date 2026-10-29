package realtime

import (
	"crypto/rand"
	"encoding/base64"
	"github.com/GajapriyanV/SetPiece/backend/internal/auth"
	"sync"
	"time"
)

type ticket struct {
	identity auth.Identity
	origin   string
	expires  time.Time
}
type tickets struct {
	sync.Mutex
	values map[string]ticket
	issued map[string]time.Time
}

func newTickets() *tickets {
	return &tickets{values: map[string]ticket{}, issued: map[string]time.Time{}}
}
func (t *tickets) issue(id auth.Identity, origin string, now time.Time) (string, bool) {
	t.Lock()
	defer t.Unlock()
	for key, v := range t.values {
		if !now.Before(v.expires) {
			delete(t.values, key)
		}
	}
	for key, at := range t.issued {
		if now.Sub(at) >= time.Second {
			delete(t.issued, key)
		}
	}
	if id.ID == "" || !now.Before(id.ExpiresAt) || len(t.values) >= 1024 || len(t.issued) >= 1024 {
		return "", false
	}
	if _, ok := t.issued[id.ID]; ok {
		return "", false
	}
	var b [32]byte
	if _, e := rand.Read(b[:]); e != nil {
		return "", false
	}
	token := base64.RawURLEncoding.EncodeToString(b[:])
	expires := now.Add(30 * time.Second)
	if id.ExpiresAt.Before(expires) {
		expires = id.ExpiresAt
	}
	t.values[token] = ticket{id, origin, expires}
	t.issued[id.ID] = now
	return token, true
}
func (t *tickets) consume(token, origin string, now time.Time) (auth.Identity, bool) {
	t.Lock()
	defer t.Unlock()
	v, ok := t.values[token]
	delete(t.values, token)
	if !ok || v.origin != origin || !now.Before(v.expires) || !now.Before(v.identity.ExpiresAt) {
		return auth.Identity{}, false
	}
	return v.identity, true
}
