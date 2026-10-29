package httpapi

import (
	"context"
	"errors"
	"github.com/GajapriyanV/SetPiece/backend/internal/auth"
	"github.com/GajapriyanV/SetPiece/backend/internal/debates"
	"github.com/GajapriyanV/SetPiece/backend/internal/livekit"
	"net/http"
	"regexp"
)

type MediaService interface {
	Issue(context.Context, string, auth.Identity) (livekit.Token, error)
	Sync(context.Context, string, auth.Identity) (livekit.Permission, error)
}

var mediaRoomID = regexp.MustCompile("^[a-f0-9]{8}$")

func registerMedia(mux *http.ServeMux, d Dependencies) {
	if d.Media == nil {
		return
	}
	handler := func(sync bool) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			id, ok := roomIdentity(w, r, d)
			if !ok {
				return
			}
			room := r.URL.Query().Get("roomId")
			if !mediaRoomID.MatchString(room) {
				roomError(w, debates.ErrInvalid)
				return
			}
			ctx, cancel := context.WithTimeout(r.Context(), d.QueryTimeout)
			defer cancel()
			var result any
			var e error
			if sync {
				result, e = d.Media.Sync(ctx, room, id)
			} else {
				result, e = d.Media.Issue(ctx, room, id)
			}
			if e != nil {
				if errors.Is(e, debates.ErrForbidden) || errors.Is(e, debates.ErrNotFound) || errors.Is(e, debates.ErrStale) {
					roomError(w, e)
				} else {
					writeJSON(w, 503, map[string]string{"error": "Audio temporarily unavailable; retry"})
				}
				return
			}
			writeJSON(w, 200, result)
		}
	}
	mux.HandleFunc("GET /api/livekit/token", handler(false))
	// Preserve the existing URL but require POST for permission mutation in v2.
	mux.HandleFunc("POST /api/livekit/sync", handler(true))
}
