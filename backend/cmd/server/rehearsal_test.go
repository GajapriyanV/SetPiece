package main

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/GajapriyanV/SetPiece/backend/internal/config"
	"github.com/GajapriyanV/SetPiece/backend/internal/debates"
	"github.com/GajapriyanV/SetPiece/backend/internal/ownership"
	"github.com/GajapriyanV/SetPiece/backend/internal/realtime"
	"github.com/GajapriyanV/SetPiece/backend/migrations"
	"github.com/coder/websocket"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestIntegratedRehearsal(t *testing.T) {
	uri := os.Getenv("SETPIECE_REHEARSAL_TEST_DATABASE_URL")
	if uri == "" {
		t.Skip("configure a NEW EMPTY local setpiece_m5_test_* database")
	}
	if config.ValidateRehearsalDatabaseURI(uri) != nil || !strings.Contains(uri, "/setpiece_m5_test_") {
		t.Fatal("requires a disposable rehearsal test database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()
	pc, e := pgxpool.ParseConfig(uri)
	if e != nil {
		t.Fatal("invalid fixture config")
	}
	pc.MaxConns = 3
	pool, e := pgxpool.NewWithConfig(ctx, pc)
	if e != nil {
		t.Fatal("fixture unavailable")
	}
	defer pool.Close()
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, e := pool.Exec(ctx, sql, args...); e != nil {
			t.Fatal(e)
		}
	}
	var count int
	if e = pool.QueryRow(ctx, "SELECT count(*) FROM pg_tables WHERE schemaname IN ('public','auth','setpiece_runtime','setpiece_migrations')").Scan(&count); e != nil || count != 0 {
		t.Fatal("requires NEW EMPTY fixture")
	}
	fixture, e := os.ReadFile(filepath.Join("..", "..", "internal", "forum", "testdata", "schema.sql"))
	if e != nil {
		t.Fatal(e)
	}
	exec(string(fixture))
	// A failed third migration must roll back both earlier migrations and its ledger.
	exec("ALTER TABLE public.forum_replies RENAME TO rehearsal_missing_replies")
	if e = migrations.Apply(ctx, pool); e == nil {
		t.Fatal("expected migration failure")
	}
	var rolledBack bool
	if e = pool.QueryRow(ctx, "SELECT to_regnamespace('setpiece_runtime') IS NULL AND to_regnamespace('setpiece_migrations') IS NULL").Scan(&rolledBack); e != nil || !rolledBack {
		t.Fatal("partial migration survived")
	}
	exec("ALTER TABLE public.rehearsal_missing_replies RENAME TO forum_replies")
	if e = migrations.Apply(ctx, pool); e != nil {
		t.Fatal(e)
	}
	if e = migrations.Apply(ctx, pool); e != nil {
		t.Fatal("repeat apply", e)
	}
	var checksum string
	if e = pool.QueryRow(ctx, "SELECT checksum FROM setpiece_migrations.applied WHERE name='0001_room_lifecycle.sql'").Scan(&checksum); e != nil {
		t.Fatal(e)
	}
	exec("UPDATE setpiece_migrations.applied SET checksum='changed' WHERE name='0001_room_lifecycle.sql'")
	if e = migrations.Apply(ctx, pool); e == nil {
		t.Fatal("checksum mismatch accepted")
	}
	exec("UPDATE setpiece_migrations.applied SET checksum=$1 WHERE name='0001_room_lifecycle.sql'", checksum)
	ids := []string{"11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"}
	for i, id := range ids {
		exec("INSERT INTO auth.users(id,created_at,email) VALUES($1,now(),$2)", id, fmt.Sprintf("fixture%d@example.invalid", i))
		exec("INSERT INTO public.profiles(id,username,name,country,is_admin,registration_complete) VALUES($1,$2,$2,'Canada',$3,true)", id, fmt.Sprintf("fixture%d", i), i == 2)
	}
	rehearsePermissions(t, ctx, pool, ids[0])
	key, e := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if e != nil {
		t.Fatal(e)
	}
	issuer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/auth/v1/.well-known/jwks.json" {
			http.NotFound(w, r)
			return
		}
		json.NewEncoder(w).Encode(map[string]any{"keys": []map[string]string{{"kid": "rehearsal", "kty": "EC", "alg": "ES256", "use": "sig", "crv": "P-256", "x": base64.RawURLEncoding.EncodeToString(key.X.FillBytes(make([]byte, 32))), "y": base64.RawURLEncoding.EncodeToString(key.Y.FillBytes(make([]byte, 32)))}}})
	}))
	defer issuer.Close()
	tokens := make([]string, 3)
	for i, id := range ids {
		token := jwt.NewWithClaims(jwt.SigningMethodES256, jwt.MapClaims{"iss": issuer.URL + "/auth/v1", "sub": id, "aud": "authenticated", "role": "authenticated", "exp": time.Now().Add(time.Hour).Unix(), "iat": time.Now().Unix()})
		token.Header["kid"] = "rehearsal"
		tokens[i], e = token.SignedString(key)
		if e != nil {
			t.Fatal(e)
		}
	}
	appURI, e := url.Parse(uri)
	if e != nil {
		t.Fatal(e)
	}
	appURI.User = url.User("setpiece_app")
	settings := map[string]string{"SUPABASE_URL": issuer.URL, "REHEARSAL_DATABASE_URL": appURI.String(), "DATABASE_MAX_CONNS": "5", "ALLOWED_ORIGINS": "http://localhost:3000", "PROFILE_TIME_ZONE": "UTC"}
	cfg, e := config.Load(func(k string) string { return settings[k] })
	if e != nil {
		t.Fatal(e)
	}
	// Reserve a free loopback port for the real composition root, rather than a test router.
	listener, e := net.Listen("tcp", "127.0.0.1:0")
	if e != nil {
		t.Fatal(e)
	}
	cfg.Address = listener.Addr().String()
	listener.Close()
	base := "http://" + cfg.Address
	client := &http.Client{Timeout: 5 * time.Second}
	var stop context.CancelFunc
	var done chan error
	start := func() {
		t.Helper()
		var serverCtx context.Context
		serverCtx, stop = context.WithCancel(ctx)
		done = make(chan error, 1)
		go func() { done <- runConfigured(serverCtx, cfg, slog.New(slog.NewTextHandler(io.Discard, nil))) }()
		deadline := time.Now().Add(6 * time.Second)
		for time.Now().Before(deadline) {
			select {
			case e := <-done:
				t.Fatal("server exited before readiness", e)
			default:
			}
			res, e := client.Get(base + "/ready")
			if e == nil {
				res.Body.Close()
				if res.StatusCode == 200 {
					return
				}
			}
			time.Sleep(20 * time.Millisecond)
		}
		t.Fatal("server did not become ready")
	}
	shutdown := func() {
		t.Helper()
		stop()
		select {
		case e := <-done:
			if e != nil {
				t.Fatal(e)
			}
		case <-time.After(12 * time.Second):
			t.Fatal("shutdown timed out")
		}
		stop = nil
	}
	defer func() {
		if stop != nil {
			stop()
			select {
			case <-done:
			case <-time.After(12 * time.Second):
				t.Error("cleanup timed out")
			}
		}
	}()
	request := func(method, path string, user int, body any, status int) map[string]any {
		t.Helper()
		var data []byte
		if body != nil {
			data, _ = json.Marshal(body)
		}
		req, e := http.NewRequestWithContext(ctx, method, base+path, bytes.NewReader(data))
		if e != nil {
			t.Fatal(e)
		}
		if user >= 0 {
			req.Header.Set("Authorization", "Bearer "+tokens[user])
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Origin", "http://localhost:3000")
		res, e := client.Do(req)
		if e != nil {
			t.Fatal(e)
		}
		defer res.Body.Close()
		raw, e := io.ReadAll(io.LimitReader(res.Body, 1<<20))
		if e != nil {
			t.Fatal(e)
		}
		if res.StatusCode != status {
			t.Fatalf("%s %s: %d %s", method, path, res.StatusCode, raw)
		}
		var out map[string]any
		if e = json.Unmarshal(raw, &out); e != nil {
			t.Fatal(e)
		}
		return out
	}
	start()
	if e = migrations.Apply(ctx, pool); e == nil {
		t.Fatal("migration ignored active runtime lease")
	}
	if _, cleanup, e := startLifecycle(ctx, uri, slog.New(slog.NewTextHandler(io.Discard, nil))); e == nil {
		cleanup()
		t.Fatal("second runtime obtained ownership")
	}
	request("GET", "/api/account/profile", -1, nil, 401)
	// Real JWT verification, shared profile writes and community projections.
	request("PATCH", "/api/account/profile", 0, map[string]any{"name": "Rehearsed player", "username": "rehearsed", "country": "Canada", "club": nil, "avatar_url": nil}, 200)
	thread := request("POST", "/api/forum", 0, map[string]any{"title": "Rehearsal", "body": "Shared data", "flair": "General"}, 201)["id"].(string)
	reply := request("POST", "/api/forum/"+thread+"/reply", 1, map[string]any{"body": "Reply"}, 201)["reply"].(map[string]any)["id"].(string)
	for i := 0; i < 2; i++ {
		request("POST", "/api/forum/reply/"+reply+"/like", 0, map[string]bool{"liked": true}, 200)
	}
	profile := request("GET", "/api/account/profile", 1, nil, 200)
	if profile["upvotes_received"] != float64(1) {
		t.Fatal("profile did not see forum counter")
	}
	detail := request("GET", "/api/forum/"+thread, -1, nil, 200)
	if detail["thread"].(map[string]any)["author"].(map[string]any)["username"] != "rehearsed" {
		t.Fatal("forum did not see profile change")
	}
	request("GET", "/api/notifications", 1, nil, 200)
	request("PATCH", "/api/notifications", 1, nil, 200)
	request("POST", "/api/contact", 0, map[string]string{"subject": "Rehearsal", "message": "Integrated support"}, 200)
	request("GET", "/api/admin/contact", 0, nil, 403)
	if len(request("GET", "/api/admin/contact", 2, nil, 200)["tickets"].([]any)) != 1 {
		t.Fatal("missing support ticket")
	}
	room := request("POST", "/api/rooms", 0, map[string]any{"topics": []debates.Topic{{Topic: "Rehearsal debate", SideA: "A", SideB: "B"}}}, 201)["roomId"].(string)
	type event struct {
		Type, RequestID string
		Data            json.RawMessage
	}
	sockets := []*websocket.Conn{}
	queues := []chan event{}
	connect := func(user int) {
		t.Helper()
		ticket := request("POST", "/api/realtime/ticket", user, nil, 200)["ticket"].(string)
		ws, _, e := websocket.Dial(ctx, "ws://"+cfg.Address+"/api/realtime/ws?ticket="+ticket, &websocket.DialOptions{HTTPHeader: http.Header{"Origin": []string{"http://localhost:3000"}}})
		if e != nil {
			t.Fatal(e)
		}
		queue := make(chan event, 256)
		sockets = append(sockets, ws)
		queues = append(queues, queue)
		go func() {
			defer close(queue)
			for {
				_, raw, e := ws.Read(ctx)
				if e != nil {
					return
				}
				var v event
				if json.Unmarshal(raw, &v) != nil {
					return
				}
				select {
				case queue <- v:
				case <-ctx.Done():
					return
				}
			}
		}()
	}
	defer func() {
		for _, ws := range sockets {
			ws.CloseNow()
		}
	}()
	seq := 0
	command := func(user int, kind string, data any) {
		t.Helper()
		seq++
		id := fmt.Sprint(seq)
		raw, _ := json.Marshal(realtime.Envelope{Version: realtime.ProtocolVersion, Type: kind, RequestID: id, Data: data})
		if e := sockets[user].Write(ctx, websocket.MessageText, raw); e != nil {
			t.Fatal(e)
		}
		timeout := time.NewTimer(5 * time.Second)
		defer timeout.Stop()
		for {
			select {
			case v, ok := <-queues[user]:
				if !ok {
					t.Fatal("socket closed")
				}
				if v.RequestID == id && (v.Type == "ack" || v.Type == "room:error") {
					if v.Type != "ack" {
						t.Fatalf("%s: %s", kind, v.Data)
					}
					return
				}
			case <-timeout.C:
				t.Fatal("command timeout", kind)
			}
		}
	}
	for i := range ids {
		connect(i)
		command(i, "room:join", map[string]string{"roomId": room})
	}
	repo := debates.NewPostgres(pool)
	state := func() debates.Room {
		t.Helper()
		r, e := repo.Read(ctx, room)
		if e != nil {
			t.Fatal(e)
		}
		return r
	}
	for i, side := range []string{"a", "b"} {
		command(i, "side:pick", map[string]any{"side": side, "revision": state().Revision})
	}
	for i := 0; i < 2; i++ {
		command(i, "side:ready", map[string]any{"revision": state().Revision})
	}
	command(2, "chat:send", map[string]string{"body": "Rehearsal audience"})
	wait := func(check func() bool) {
		t.Helper()
		deadline := time.Now().Add(5 * time.Second)
		for time.Now().Before(deadline) {
			if check() {
				return
			}
			time.Sleep(20 * time.Millisecond)
		}
		t.Fatal("state did not advance")
	}
	expire := func() {
		t.Helper()
		old := state()
		_, e := repo.Update(ctx, room, func(r *debates.Room) error {
			deadline := time.Now().Add(-time.Second)
			r.Deadline = &deadline
			return nil
		})
		if e != nil {
			t.Fatal(e)
		}
		wait(func() bool { r := state(); return r.Status != old.Status || r.PhaseIndex != old.PhaseIndex })
	}
	// Time is advanced only in disposable fixture state; the real scheduler executes transitions.
	for n := 0; n < 7; n++ {
		expire()
	}
	r := state()
	if r.Status != "voting" {
		t.Fatalf("expected voting, got %s", r.Status)
	}
	debateID := r.DebateID
	request("POST", "/api/debates/"+debateID+"/votes", 2, map[string]string{"side": "a"}, 200)
	request("POST", "/api/debates/"+debateID+"/votes", 2, map[string]string{"side": "a"}, 200)
	expire()
	wait(func() bool { return state().Status == "results" })
	profile = request("GET", "/api/account/profile", 0, nil, 200)
	if profile["wins"] != float64(1) || profile["elo"] != float64(1216) {
		t.Fatalf("result not visible to profile: wins=%v elo=%v", profile["wins"], profile["elo"])
	}
	rank := request("GET", "/api/leaderboard/me?type=ranked", 0, nil, 200)
	if rank["rank"] != float64(1) || rank["elo"] != float64(1216) {
		t.Fatal("ranking did not see result")
	}
	exec("UPDATE public.forum_threads SET closes_at=now()-interval '1 second' WHERE id=$1", thread)
	request("GET", "/api/forum/"+thread, 0, nil, 200)
	if request("GET", "/api/account/profile", 1, nil, 200)["mvp_count"] != float64(1) {
		t.Fatal("MVP not visible")
	}
	shutdown()
	// Controlled migration rerun and restart cannot duplicate committed awards/results.
	if e = migrations.Apply(ctx, pool); e != nil {
		t.Fatal(e)
	}
	start()
	request("GET", "/api/forum/"+thread, 0, nil, 200)
	if request("GET", "/api/account/profile", 0, nil, 200)["wins"] != float64(1) || request("GET", "/api/account/profile", 1, nil, 200)["mvp_count"] != float64(1) {
		t.Fatal("restart duplicated result or award")
	}
	request("GET", "/api/notifications", 1, nil, 200)
	// Kill only the lease connection. The shared app pool remains usable, but
	// the process must refuse work and shut down rather than silently reacquire.
	var pid int
	if e = pool.QueryRow(ctx, "SELECT pid FROM pg_locks WHERE locktype='advisory' AND granted AND classid=($1::bigint >> 32)::oid AND objid=($1::bigint & 4294967295)::oid AND objsubid=1", ownership.LockID).Scan(&pid); e != nil {
		t.Fatal(e)
	}
	exec("SELECT pg_terminate_backend($1)", pid)
	select {
	case e = <-done:
		if !errors.Is(e, ownership.ErrLost) {
			t.Fatal("lease loss did not stop runtime", e)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("runtime survived lease loss")
	}
	stop()
	stop = nil
	// A fresh owner recovers committed state without duplicating finalization.
	start()
	if request("GET", "/api/account/profile", 0, nil, 200)["wins"] != float64(1) {
		t.Fatal("takeover changed wins")
	}
	shutdown()
	t.Log("real composition + ES256/JWKS + shared profiles/forum/support + sockets/chat/voting/ranks + shutdown/restart + atomic migrations passed")
}
