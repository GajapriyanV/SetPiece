package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/GajapriyanV/SetPiece/backend/internal/application"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakeRuntime struct {
	draining bool
	active   int
	err      error
}

func (f *fakeRuntime) SetDraining(v bool)                         { f.draining = v }
func (f *fakeRuntime) Draining() bool                             { return f.draining }
func (f *fakeRuntime) ActiveDebates(context.Context) (int, error) { return f.active, f.err }
func TestRuntimeAdministration(t *testing.T) {
	for _, tc := range []struct {
		name, token, body string
		adminErr          error
		active, status    int
		draining, safe    bool
	}{
		{name: "anonymous", body: `{"draining":true}`, status: 401},
		{name: "nonadmin", token: "Bearer test", body: `{"draining":true}`, adminErr: application.ErrForbidden, status: 403},
		{name: "database failure", token: "Bearer test", body: `{"draining":true}`, adminErr: errors.New("private secret"), status: 503},
		{name: "missing field", token: "Bearer test", body: `{}`, status: 400},
		{name: "unknown field", token: "Bearer test", body: `{"draining":true,"extra":1}`, status: 400},
		{name: "trailing JSON", token: "Bearer test", body: `{"draining":true}{}`, status: 400},
		{name: "active debate", token: "Bearer test", body: `{"draining":true}`, active: 1, status: 200, draining: true},
		{name: "safe to stop", token: "Bearer test", body: `{"draining":true}`, status: 200, draining: true, safe: true},
		{name: "resume", token: "Bearer test", body: `{"draining":false}`, status: 200},
	} {
		t.Run(tc.name, func(t *testing.T) {
			runtime := &fakeRuntime{active: tc.active}
			h := New(Dependencies{Auth: fakeAuth{}, Logger: quietLogger(), Runtime: runtime, RuntimeAdmin: func(_ context.Context, id string) error {
				if id != "verified-user" {
					t.Error("unverified identity")
				}
				return tc.adminErr
			}})
			req := httptest.NewRequest("POST", "/api/admin/runtime/drain", strings.NewReader(tc.body))
			req.Header.Set("Authorization", tc.token)
			w := httptest.NewRecorder()
			h.ServeHTTP(w, req)
			if w.Code != tc.status || runtime.draining != tc.draining {
				t.Fatalf("status=%d draining=%v", w.Code, runtime.draining)
			}
			if strings.Contains(w.Body.String(), "secret") {
				t.Fatal("leaked error")
			}
			if w.Code == 200 {
				var body struct {
					Safe bool `json:"safeToStop"`
				}
				if json.Unmarshal(w.Body.Bytes(), &body) != nil || body.Safe != tc.safe {
					t.Fatal(w.Body.String())
				}
			}
		})
	}
}
func TestRuntimeReadAndFailure(t *testing.T) {
	runtime := &fakeRuntime{draining: true, err: errors.New("private secret")}
	h := New(Dependencies{Auth: fakeAuth{}, Logger: quietLogger(), Runtime: runtime, RuntimeAdmin: func(context.Context, string) error { return nil }})
	req := httptest.NewRequest("GET", "/api/admin/runtime", nil)
	req.Header.Set("Authorization", "Bearer test")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	if w.Code != 503 || strings.Contains(w.Body.String(), "secret") {
		t.Fatal(w.Body.String())
	}
}
