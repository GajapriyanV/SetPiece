package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/GajapriyanV/SetPiece/backend/internal/auth"
	"github.com/GajapriyanV/SetPiece/backend/internal/leaderboard"
	"github.com/GajapriyanV/SetPiece/backend/internal/users"
	"github.com/jackc/pgx/v5"
	"io"
	"net/http"
)

type AccountService interface {
	ReadProfile(context.Context, auth.Identity) (users.Profile, error)
	Public(context.Context, string) (map[string]any, error)
	Self(context.Context, auth.Identity) (json.RawMessage, error)
	Edit(context.Context, auth.Identity, users.Edit, bool) (json.RawMessage, error)
	Available(context.Context, auth.Identity, string) (bool, error)
	Stats(context.Context) (json.RawMessage, error)
}
type RankingService interface {
	List(context.Context, leaderboard.Filter, string) (json.RawMessage, error)
	Me(context.Context, leaderboard.Filter, string) (json.RawMessage, error)
}

func accountError(w http.ResponseWriter, e error) {
	code, message := 503, "Profile service temporarily unavailable"
	switch {
	case errors.Is(e, users.ErrNotFound), errors.Is(e, pgx.ErrNoRows):
		code, message = 404, "Profile not found"
	case errors.Is(e, users.ErrInvalid), errors.Is(e, leaderboard.ErrInvalid):
		code, message = 400, "Invalid profile or ranking fields"
	case errors.Is(e, users.ErrUsername):
		code, message = 409, "Username already taken"
	case errors.Is(e, users.ErrCooldown):
		code, message = 409, "You can change your username once every 14 days"
	case errors.Is(e, users.ErrReadOnly):
		message = "Profile writes are disabled in this environment"
	}
	writeJSON(w, code, map[string]string{"error": message})
}
func registerAccounts(mux *http.ServeMux, d Dependencies) {
	if d.Accounts != nil {
		mux.HandleFunc("GET /api/account/profile", func(w http.ResponseWriter, r *http.Request) {
			id, ok := roomIdentity(w, r, d)
			if !ok {
				return
			}
			ctx, cancel := context.WithTimeout(r.Context(), d.QueryTimeout)
			defer cancel()
			p, e := d.Accounts.ReadProfile(ctx, id)
			if e != nil {
				accountError(w, e)
				return
			}
			writeJSON(w, 200, p)
		})
		mux.HandleFunc("GET /api/account/self", func(w http.ResponseWriter, r *http.Request) {
			id, ok := roomIdentity(w, r, d)
			if !ok {
				return
			}
			ctx, cancel := context.WithTimeout(r.Context(), d.QueryTimeout)
			defer cancel()
			p, e := d.Accounts.Self(ctx, id)
			if e != nil {
				accountError(w, e)
				return
			}
			writeJSON(w, 200, p)
		})
		mux.HandleFunc("GET /api/account/username", func(w http.ResponseWriter, r *http.Request) {
			id, ok := roomIdentity(w, r, d)
			if !ok {
				return
			}
			ctx, cancel := context.WithTimeout(r.Context(), d.QueryTimeout)
			defer cancel()
			available, e := d.Accounts.Available(ctx, id, r.URL.Query().Get("username"))
			if e != nil {
				accountError(w, e)
				return
			}
			writeJSON(w, 200, map[string]bool{"available": available})
		})
		for _, pattern := range []string{"PATCH /api/account/profile", "POST /api/account/onboarding"} {
			mux.HandleFunc(pattern, func(w http.ResponseWriter, r *http.Request) {
				id, ok := roomIdentity(w, r, d)
				if !ok {
					return
				}
				var input users.Edit
				dec := json.NewDecoder(r.Body)
				dec.DisallowUnknownFields()
				if dec.Decode(&input) != nil || dec.Decode(&struct{}{}) != io.EOF {
					accountError(w, users.ErrInvalid)
					return
				}
				ctx, cancel := context.WithTimeout(r.Context(), d.QueryTimeout)
				defer cancel()
				p, e := d.Accounts.Edit(ctx, id, input, r.Method == "POST")
				if e != nil {
					accountError(w, e)
					return
				}
				writeJSON(w, 200, p)
			})
		}
		mux.HandleFunc("GET /api/profiles/{username}", func(w http.ResponseWriter, r *http.Request) {
			ctx, cancel := context.WithTimeout(r.Context(), d.QueryTimeout)
			defer cancel()
			p, e := d.Accounts.Public(ctx, r.PathValue("username"))
			if e != nil {
				accountError(w, e)
				return
			}
			writeJSON(w, 200, p)
		})
		mux.HandleFunc("GET /api/statistics", func(w http.ResponseWriter, r *http.Request) {
			ctx, cancel := context.WithTimeout(r.Context(), d.QueryTimeout)
			defer cancel()
			p, e := d.Accounts.Stats(ctx)
			if e != nil {
				accountError(w, e)
				return
			}
			writeJSON(w, 200, p)
		})
	}
	if d.Rankings != nil {
		for _, path := range []string{"/api/leaderboard", "/api/leaderboard/me"} {
			mux.HandleFunc("GET "+path, func(w http.ResponseWriter, r *http.Request) {
				f, e := leaderboard.Parse(r.URL.Query())
				if e != nil {
					accountError(w, e)
					return
				}
				id := ""
				if f.Section == "regional" || r.URL.Path == "/api/leaderboard/me" {
					identity, ok := roomIdentity(w, r, d)
					if !ok {
						return
					}
					id = identity.ID
				}
				ctx, cancel := context.WithTimeout(r.Context(), d.QueryTimeout)
				defer cancel()
				var p json.RawMessage
				if r.URL.Path == "/api/leaderboard/me" {
					p, e = d.Rankings.Me(ctx, f, id)
				} else {
					p, e = d.Rankings.List(ctx, f, id)
				}
				if e != nil {
					accountError(w, e)
					return
				}
				writeJSON(w, 200, p)
			})
		}
	}
}
