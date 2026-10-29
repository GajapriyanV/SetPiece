package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/GajapriyanV/SetPiece/backend/internal/auth"
	"github.com/GajapriyanV/SetPiece/backend/internal/debates"
)

type RoomDirectory interface {
	PublicPage(context.Context, string, int) ([]debates.PublicRoom, string, error)
	LiveCount(context.Context) (int, error)
}
type RoomService interface {
	Create(context.Context, string, []debates.Topic, bool) (debates.Room, error)
	List(context.Context, string, int) ([]debates.Room, error)
	State(context.Context, string, string) (debates.Room, error)
}

func roomIdentity(w http.ResponseWriter, r *http.Request, d Dependencies) (auth.Identity, bool) {
	fields := strings.Fields(r.Header.Get("Authorization"))
	if len(fields) != 2 || !strings.EqualFold(fields[0], "Bearer") || d.Auth == nil {
		writeJSON(w, 401, map[string]string{"error": "Not authenticated"})
		return auth.Identity{}, false
	}
	identity, e := d.Auth.Verify(r.Context(), fields[1])
	if e != nil {
		status := 401
		if errors.Is(e, auth.ErrUnavailable) {
			status = 503
		}
		writeJSON(w, status, map[string]string{"error": "Authentication unavailable"})
		return auth.Identity{}, false
	}
	return identity, true
}
func roomError(w http.ResponseWriter, e error) {
	status, message := 503, "Room temporarily unavailable"
	switch {
	case errors.Is(e, debates.ErrNotFound):
		status, message = 404, "Room not found"
	case errors.Is(e, debates.ErrForbidden):
		status, message = 403, "Room membership required"
	case errors.Is(e, debates.ErrInvalid):
		status, message = 400, "Invalid room request"
	case errors.Is(e, debates.ErrConflict), errors.Is(e, debates.ErrStale):
		status, message = 409, "Room state conflict"
	}
	writeJSON(w, status, map[string]string{"error": message})
}
func registerRooms(mux *http.ServeMux, d Dependencies) {
	if d.Rooms == nil {
		return
	}
	mux.HandleFunc("POST /api/rooms", func(w http.ResponseWriter, r *http.Request) {
		identity, ok := roomIdentity(w, r, d)
		if !ok {
			return
		}
		var input struct {
			Topics   []debates.Topic `json:"topics"`
			Featured bool            `json:"isFeatured"`
		}
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		if decoder.Decode(&input) != nil || decoder.Decode(&struct{}{}) != io.EOF {
			roomError(w, debates.ErrInvalid)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), d.QueryTimeout)
		defer cancel()
		room, e := d.Rooms.Create(ctx, identity.ID, input.Topics, input.Featured)
		if e != nil {
			roomError(w, e)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"roomId": room.ID, "revision": room.Revision})
	})
	mux.HandleFunc("GET /api/rooms", func(w http.ResponseWriter, r *http.Request) {
		limit := 50
		if raw := r.URL.Query().Get("limit"); raw != "" {
			v, e := strconv.Atoi(raw)
			if e != nil || v < 1 || v > 100 {
				roomError(w, debates.ErrInvalid)
				return
			}
			limit = v
		}
		ctx, cancel := context.WithTimeout(r.Context(), d.QueryTimeout)
		defer cancel()
		if d.Directory != nil {
			rooms, cursor, e := d.Directory.PublicPage(ctx, r.URL.Query().Get("after"), limit)
			if e != nil {
				roomError(w, e)
				return
			}
			writeJSON(w, 200, map[string]any{"rooms": rooms, "nextCursor": cursor})
			return
		}
		rooms, e := d.Rooms.List(ctx, r.URL.Query().Get("after"), limit)
		if e != nil {
			roomError(w, e)
			return
		}
		summaries := []map[string]any{}
		cursor := ""
		for _, room := range rooms {
			summaries = append(summaries, map[string]any{"roomId": room.ID, "status": room.Status, "topic": room.Topic(), "isFeatured": room.Featured, "debatesCompleted": room.Completed, "revision": room.Revision})
			cursor = room.ID
		}
		writeJSON(w, 200, map[string]any{"rooms": summaries, "nextCursor": cursor})
	})
	if d.Directory != nil {
		mux.HandleFunc("GET /api/rooms/stats", func(w http.ResponseWriter, r *http.Request) {
			ctx, cancel := context.WithTimeout(r.Context(), d.QueryTimeout)
			defer cancel()
			count, e := d.Directory.LiveCount(ctx)
			if e != nil {
				roomError(w, e)
				return
			}
			writeJSON(w, 200, map[string]int{"debatingNow": count})
		})
	}
	mux.HandleFunc("GET /api/rooms/{roomId}/state", func(w http.ResponseWriter, r *http.Request) {
		identity, ok := roomIdentity(w, r, d)
		if !ok {
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), d.QueryTimeout)
		defer cancel()
		room, e := d.Rooms.State(ctx, r.PathValue("roomId"), identity.ID)
		if e != nil {
			roomError(w, e)
			return
		}
		// Internal v2 REST contract; socket event mapping is phase 3A.
		writeJSON(w, 200, map[string]any{"version": 1, "state": room, "phase": room.Phase()})
	})
}
