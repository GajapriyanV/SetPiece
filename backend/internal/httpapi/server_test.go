package httpapi

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/GajapriyanV/SetPiece/backend/internal/auth"
	"github.com/GajapriyanV/SetPiece/backend/internal/users"
)

type fakeAuth struct{ err error }

func (f fakeAuth) Verify(context.Context, string) (auth.Identity, error) {
	return auth.Identity{ID: "verified-user"}, f.err
}

type fakeDB struct{ err error }

func (f fakeDB) Ping(context.Context) error { return f.err }

type fakeProfiles struct {
	err error
	id  string
}

func (f *fakeProfiles) ReadProfile(ctx context.Context, identity auth.Identity) (users.Profile, error) {
	f.id = identity.ID
	return users.Profile{}, f.err
}
func quietLogger() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

func TestProfileAuthenticationAndErrors(t *testing.T) {
	tests := []struct {
		name, header        string
		authErr, profileErr error
		configured          bool
		want                int
	}{
		{"no bearer", "", nil, nil, true, 401},
		{"malformed", "Bearer", nil, nil, true, 401},
		{"extra token", "Bearer a b", nil, nil, true, 401},
		{"invalid", "Bearer test", auth.ErrUnauthorized, nil, true, 401},
		{"auth unavailable", "Bearer test", auth.ErrUnavailable, nil, true, 503},
		{"not configured", "Bearer test", nil, nil, false, 503},
		{"missing profile", "Bearer test", nil, users.ErrNotFound, true, 404},
		{"database failed", "Bearer test", nil, errors.New("postgres://password@private-host"), true, 503},
		{"valid", "Bearer test", nil, nil, true, 200},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			profiles := &fakeProfiles{err: tc.profileErr}
			d := Dependencies{Auth: fakeAuth{tc.authErr}, Logger: quietLogger()}
			if tc.configured {
				d.Profiles = profiles
			}
			req := httptest.NewRequest("GET", "/api/profile/me?userId=attacker", nil)
			req.Header.Set("Authorization", tc.header)
			w := httptest.NewRecorder()
			New(d).ServeHTTP(w, req)
			if w.Code != tc.want {
				t.Fatalf("status %d body %s", w.Code, w.Body.String())
			}
			if strings.Contains(w.Body.String(), "password") {
				t.Fatal("leaked database details")
			}
			if tc.want == 200 && profiles.id != "verified-user" {
				t.Fatal("identity was not sourced from verified auth")
			}
			if w.Header().Get("Cache-Control") != "no-store" || w.Header().Get("X-Request-ID") == "" {
				t.Fatal("missing response metadata")
			}
		})
	}
}

func TestReadiness(t *testing.T) {
	for _, tc := range []struct {
		name     string
		db       Database
		profiles ProfileReader
		want     int
	}{
		{"unconfigured", nil, nil, 503},
		{"db but no profile adapter", fakeDB{}, nil, 503},
		{"unhealthy", fakeDB{errors.New("offline")}, &fakeProfiles{}, 503},
		{"ready", fakeDB{}, &fakeProfiles{}, 200},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := New(Dependencies{Database: tc.db, Profiles: tc.profiles, Logger: quietLogger()})
			for path, want := range map[string]int{"/health": 200, "/ready": tc.want} {
				w := httptest.NewRecorder()
				h.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
				if w.Code != want {
					t.Fatalf("%s = %d", path, w.Code)
				}
			}
		})
	}
}

func TestOrigins(t *testing.T) {
	h := New(Dependencies{AllowedOrigins: []string{"https://app.example"}, Logger: quietLogger()})
	for _, tc := range []struct {
		origin string
		want   int
	}{
		{"https://app.example", 200}, {"https://app.example.evil", 403}, {"null", 403}, {"", 200},
	} {
		req := httptest.NewRequest("GET", "/health", nil)
		req.Header.Set("Origin", tc.origin)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, req)
		if w.Code != tc.want {
			t.Fatalf("origin %q status %d", tc.origin, w.Code)
		}
	}
}

type waitingProfiles struct{}

func (waitingProfiles) ReadProfile(ctx context.Context, _ auth.Identity) (users.Profile, error) {
	<-ctx.Done()
	return users.Profile{}, ctx.Err()
}

func TestQueryTimeout(t *testing.T) {
	h := New(Dependencies{Auth: fakeAuth{}, Profiles: waitingProfiles{}, QueryTimeout: 10 * time.Millisecond, Logger: quietLogger()})
	req := httptest.NewRequest("GET", "/api/profile/me", nil)
	req.Header.Set("Authorization", "Bearer test")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	if w.Code != 503 {
		t.Fatalf("status %d", w.Code)
	}
}
