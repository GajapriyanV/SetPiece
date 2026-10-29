package realtime

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/GajapriyanV/SetPiece/backend/internal/auth"
	"github.com/coder/websocket"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

type fakeAuth struct{}

func (fakeAuth) Verify(ctx context.Context, raw string) (auth.Identity, error) {
	if raw == "bad" {
		return auth.Identity{}, auth.ErrUnauthorized
	}
	return auth.Identity{ID: raw, ExpiresAt: time.Now().Add(time.Hour)}, nil
}
func TestTicketsExpiryReplayOriginAndBounds(t *testing.T) {
	tickets := newTickets()
	now := time.Now()
	id := auth.Identity{ID: "user", ExpiresAt: now.Add(time.Hour)}
	token, ok := tickets.issue(id, "https://client", now)
	if !ok {
		t.Fatal("issue")
	}
	var wg sync.WaitGroup
	accepted := make(chan bool, 20)
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); _, ok := tickets.consume(token, "https://client", now); accepted <- ok }()
	}
	wg.Wait()
	close(accepted)
	count := 0
	for ok := range accepted {
		if ok {
			count++
		}
	}
	if count != 1 {
		t.Fatal(count)
	}
	token, _ = tickets.issue(id, "https://client", now.Add(time.Second))
	if _, ok = tickets.consume(token, "https://evil", now.Add(time.Second)); ok {
		t.Fatal("origin")
	}
	token, _ = tickets.issue(id, "https://client", now.Add(2*time.Second))
	if _, ok = tickets.consume(token, "https://client", now.Add(33*time.Second)); ok {
		t.Fatal("expiry")
	}
	for i := 0; i < 1100; i++ {
		_, _ = tickets.issue(auth.Identity{ID: fmt.Sprint(i), ExpiresAt: now.Add(time.Hour)}, "https://client", now)
	}
	if len(tickets.values) > 1024 || len(tickets.issued) > 1024 {
		t.Fatal("unbounded")
	}
	if _, ok = tickets.issue(auth.Identity{ID: "expired", ExpiresAt: now}, "https://client", now); ok {
		t.Fatal("expired auth")
	}
}
func TestUpgradeAndValidation(t *testing.T) {
	h := New(nil, nil, nil, fakeAuth{}, []string{"https://client"})
	defer h.Close()
	mux := http.NewServeMux()
	mux.HandleFunc("/ticket", h.Ticket)
	mux.HandleFunc("/ws", h.Upgrade)
	server := httptest.NewServer(mux)
	defer server.Close()
	for _, origin := range []string{"", "https://evil", "https://client.evil"} {
		r := httptest.NewRequest("POST", "/ticket", nil)
		r.Header.Set("Origin", origin)
		r.Header.Set("Authorization", "Bearer user")
		w := httptest.NewRecorder()
		h.Ticket(w, r)
		if w.Code != 403 {
			t.Fatal(w.Code)
		}
	}
	request := httptest.NewRequest("POST", "/ticket", nil)
	request.Header.Set("Origin", "https://client")
	request.Header.Set("Authorization", "Bearer good")
	w := httptest.NewRecorder()
	h.Ticket(w, request)
	if w.Code != 200 {
		t.Fatal(w.Code)
	}
	var body struct{ Ticket string }
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	url := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?ticket=" + body.Ticket
	ws, _, e := websocket.Dial(ctx, url, &websocket.DialOptions{HTTPHeader: http.Header{"Origin": []string{"https://client"}}})
	if e != nil {
		t.Fatal(e)
	}
	defer ws.CloseNow()
	_, response, e := websocket.Dial(ctx, url, &websocket.DialOptions{HTTPHeader: http.Header{"Origin": []string{"https://client"}}})
	if e == nil || response.StatusCode != 401 {
		t.Fatal("replay")
	}
	for _, payload := range []string{"{", `{"v":1,"type":"room:join","requestId":"a","data":{},"unknown":true}`, `{"v":2,"type":"room:leave","requestId":"a","data":{}}`, `{"v":1,"type":"unknown","requestId":"a","data":{}}`} {
		if e = ws.Write(ctx, websocket.MessageText, []byte(payload)); e != nil {
			t.Fatal(e)
		}
		_, data, e := ws.Read(ctx)
		if e != nil {
			t.Fatal(e)
		}
		var event Envelope
		_ = json.Unmarshal(data, &event)
		if event.Type != "room:error" {
			t.Fatal(string(data))
		}
	}
	_ = ws.Write(ctx, websocket.MessageText, []byte(strings.Repeat("x", 17<<10)))
	if _, _, e = ws.Read(ctx); e == nil {
		t.Fatal("oversize accepted")
	}
}
func TestSlowQueueAndAuthExpiry(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	c := &client{ctx: ctx, cancel: cancel, out: make(chan []byte, 2)}
	for i := 0; i < 3; i++ {
		c.send(Envelope{Type: "room:state_sync", Data: map[string]bool{"test": true}})
	}
	if ctx.Err() == nil || len(c.out) != 2 {
		t.Fatal("slow client not bounded")
	}
	h := New(nil, nil, nil, fakeAuth{}, []string{"https://client"})
	defer h.Close()
	server := httptest.NewServer(http.HandlerFunc(h.Upgrade))
	defer server.Close()
	token, ok := h.tickets.issue(auth.Identity{ID: "short", ExpiresAt: time.Now().Add(150 * time.Millisecond)}, "https://client", time.Now())
	if !ok {
		t.Fatal("issue")
	}
	ctx, cancel = context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	ws, _, e := websocket.Dial(ctx, "ws"+strings.TrimPrefix(server.URL, "http")+"?ticket="+token, &websocket.DialOptions{HTTPHeader: http.Header{"Origin": []string{"https://client"}}})
	if e != nil {
		t.Fatal(e)
	}
	defer ws.CloseNow()
	if _, _, e = ws.Read(ctx); e == nil {
		t.Fatal("expired session")
	}
}
