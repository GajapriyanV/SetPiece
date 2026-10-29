package httpapi

import (
	"context"
	"errors"
	"github.com/GajapriyanV/SetPiece/backend/internal/auth"
	"github.com/GajapriyanV/SetPiece/backend/internal/voting"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakeVoting struct {
	user, side, id string
	err            error
}

func (f *fakeVoting) Cast(_ context.Context, id string, identity auth.Identity, side string) (voting.State, error) {
	f.user = identity.ID
	f.side = side
	f.id = id
	return voting.State{DebateID: id}, f.err
}
func (f *fakeVoting) Snapshot(_ context.Context, id string, identity auth.Identity) (voting.State, error) {
	f.user = identity.ID
	f.id = id
	return voting.State{DebateID: id}, f.err
}
func TestVotingHTTP(t *testing.T) {
	for _, c := range []struct {
		method, body, token string
		err                 error
		want                int
	}{
		{"POST", `{"side":"a"}`, "", nil, 401},
		{"POST", `{"side":"a"}`, "user", nil, 200},
		{"GET", "", "user", nil, 200},
		{"POST", `{"side":"a","userId":"attacker"}`, "user", nil, 400},
		{"POST", `{"side":"a"}{}`, "user", nil, 400},
		{"POST", `{"side":"a"}`, "user", voting.ErrConflict, 409},
		{"POST", `{"side":"a"}`, "user", voting.ErrForbidden, 403},
		{"POST", `{"side":"a"}`, "user", voting.ErrClosed, 409},
		{"POST", `{"side":"a"}`, "user", errors.New("password database details"), 503},
	} {
		f := &fakeVoting{err: c.err}
		h := New(Dependencies{Auth: fakeAuth{}, Voting: f, Logger: quietLogger()})
		r := httptest.NewRequest(c.method, "/api/debates/debate/votes?userId=attacker", strings.NewReader(c.body))
		if c.token != "" {
			r.Header.Set("Authorization", "Bearer "+c.token)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != c.want {
			t.Fatalf("%d: %s", w.Code, w.Body.String())
		}
		if strings.Contains(w.Body.String(), "password") {
			t.Fatal("leaked database error")
		}
		if c.want == 200 && (f.user != "verified-user" || f.id != "debate") {
			t.Fatal("caller identity was not verified")
		}
	}
	h := New(Dependencies{Logger: quietLogger()})
	r := httptest.NewRequest("POST", "/api/debates/debate/votes", strings.NewReader(`{"side":"a"}`))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 404 {
		t.Fatal("voting must be disabled by default")
	}
}
