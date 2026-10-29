package httpapi

import (
	"context"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/GajapriyanV/SetPiece/backend/internal/debates"
)

type fakeRooms struct {
	user string
	err  error
}

func (f *fakeRooms) Create(_ context.Context, user string, _ []debates.Topic, _ bool) (debates.Room, error) {
	f.user = user
	return debates.Room{ID: "1234abcd", Revision: 1}, f.err
}
func (f *fakeRooms) List(context.Context, string, int) ([]debates.Room, error) {
	return []debates.Room{{ID: "1234abcd", Topics: []debates.Topic{{Topic: "Public", SideA: "A", SideB: "B"}}, Creator: "private-member"}}, f.err
}
func (f *fakeRooms) State(_ context.Context, room, user string) (debates.Room, error) {
	f.user = user
	return debates.Room{ID: room}, f.err
}
func TestRoomRoutes(t *testing.T) {
	for _, tc := range []struct {
		method, path, body, token string
		err                       error
		enabled                   bool
		want                      int
	}{
		{"GET", "/api/rooms", "", "", nil, false, 404},
		{"POST", "/api/rooms", `{"topics":[]}`, "", nil, true, 401},
		{"POST", "/api/rooms", `{"topics":[]}`, "token", nil, true, 201},
		{"POST", "/api/rooms", `{"topics":[],"userId":"attacker"}`, "token", nil, true, 400},
		{"POST", "/api/rooms", `{"topics":[]} {}`, "token", nil, true, 400},
		{"POST", "/api/rooms", `{"topics":[]}`, "token", debates.ErrInvalid, true, 400},
		{"GET", "/api/rooms", "", "", nil, true, 200},
		{"GET", "/api/rooms?limit=1000", "", "", nil, true, 400},
		{"GET", "/api/rooms/1234abcd/state?userId=attacker", "", "token", nil, true, 200},
		{"GET", "/api/rooms/1234abcd/state", "", "token", debates.ErrForbidden, true, 403},
		{"GET", "/api/rooms/1234abcd/state", "", "token", debates.ErrNotFound, true, 404},
		{"GET", "/api/rooms", "", "", errors.New("private database password"), true, 503},
	} {
		t.Run(tc.method+tc.path, func(t *testing.T) {
			rooms := &fakeRooms{err: tc.err}
			d := Dependencies{Auth: fakeAuth{}, Logger: quietLogger()}
			if tc.enabled {
				d.Rooms = rooms
			}
			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			if tc.token != "" {
				req.Header.Set("Authorization", "Bearer "+tc.token)
			}
			w := httptest.NewRecorder()
			New(d).ServeHTTP(w, req)
			if w.Code != tc.want {
				t.Fatalf("%d: %s", w.Code, w.Body.String())
			}
			if tc.want == 201 || (tc.want == 200 && strings.Contains(tc.path, "state")) {
				if rooms.user != "verified-user" {
					t.Fatal("caller override")
				}
			}
			if strings.Contains(w.Body.String(), "private") {
				t.Fatal("private details leaked")
			}
		})
	}
}
func TestRoomPreflight(t *testing.T) {
	for _, tc := range []struct {
		path string
		want int
	}{{"/api/rooms", 204}, {"/api/profile/me", 405}} {
		d := Dependencies{Rooms: &fakeRooms{}, Logger: quietLogger(), AllowedOrigins: []string{"https://ui.example"}}
		req := httptest.NewRequest("OPTIONS", tc.path, nil)
		req.Header.Set("Origin", "https://ui.example")
		req.Header.Set("Access-Control-Request-Method", "POST")
		w := httptest.NewRecorder()
		New(d).ServeHTTP(w, req)
		if w.Code != tc.want {
			t.Fatal(w.Code)
		}
	}
}
