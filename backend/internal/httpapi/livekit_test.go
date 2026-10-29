package httpapi

import (
	"context"
	"errors"
	"github.com/GajapriyanV/SetPiece/backend/internal/auth"
	"github.com/GajapriyanV/SetPiece/backend/internal/debates"
	"github.com/GajapriyanV/SetPiece/backend/internal/livekit"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakeMedia struct {
	user string
	err  error
}

func (f *fakeMedia) Issue(_ context.Context, _ string, id auth.Identity) (livekit.Token, error) {
	f.user = id.ID
	return livekit.Token{Token: "fixture"}, f.err
}
func (f *fakeMedia) Sync(_ context.Context, _ string, id auth.Identity) (livekit.Permission, error) {
	f.user = id.ID
	return livekit.Permission{}, f.err
}
func TestMediaHTTP(t *testing.T) {
	for _, tc := range []struct {
		method, path, token string
		err                 error
		want                int
	}{
		{"GET", "/api/livekit/token?roomId=abcdef12", "", nil, 401},
		{"GET", "/api/livekit/token?roomId=invalid", "token", nil, 400},
		{"GET", "/api/livekit/token?roomId=abcdef12&userId=attacker", "token", nil, 200},
		{"POST", "/api/livekit/sync?roomId=abcdef12", "token", nil, 200},
		{"GET", "/api/livekit/sync?roomId=abcdef12", "token", nil, 404},
		{"GET", "/api/livekit/token?roomId=abcdef12", "token", debates.ErrForbidden, 403},
		{"POST", "/api/livekit/sync?roomId=abcdef12", "token", debates.ErrStale, 409},
		{"POST", "/api/livekit/sync?roomId=abcdef12", "token", errors.New("private credentials"), 503},
	} {
		t.Run(tc.method+tc.path, func(t *testing.T) {
			media := &fakeMedia{err: tc.err}
			handler := New(Dependencies{Media: media, Auth: fakeAuth{}, Logger: quietLogger()})
			req := httptest.NewRequest(tc.method, tc.path, nil)
			if tc.token != "" {
				req.Header.Set("Authorization", "Bearer "+tc.token)
			}
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, req)
			if w.Code != tc.want {
				t.Fatalf("status %d, want %d", w.Code, tc.want)
			}
			if media.user != "" && media.user != "verified-user" {
				t.Fatal("caller identity spoofed")
			}
			if strings.Contains(w.Body.String(), "private") {
				t.Fatal("provider credentials leaked")
			}
		})
	}
}
