package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/GajapriyanV/SetPiece/backend/internal/auth"
	"github.com/GajapriyanV/SetPiece/backend/internal/users"
)

type Verifier interface {
	Verify(context.Context, string) (auth.Identity, error)
}
type Database interface{ Ping(context.Context) error }

// ProfileReader exposes the users service to HTTP transport.
type ProfileReader interface {
	ReadProfile(context.Context, auth.Identity) (users.Profile, error)
}

type Realtime interface {
	Ticket(http.ResponseWriter, *http.Request)
	Upgrade(http.ResponseWriter, *http.Request)
}

type Dependencies struct {
	Forum          ForumService
	Notifications  NotificationService
	Support        SupportService
	Accounts       AccountService
	Rankings       RankingService
	Directory      RoomDirectory
	Media          MediaService
	Realtime       Realtime
	Voting         VotingService
	Rooms          RoomService
	Auth           Verifier
	Database       Database
	Profiles       ProfileReader
	Logger         *slog.Logger
	AllowedOrigins []string
	QueryTimeout   time.Duration
	RequestTimeout time.Duration
}

func New(d Dependencies) http.Handler {
	if d.Logger == nil {
		d.Logger = slog.Default()
	}
	if d.QueryTimeout <= 0 {
		d.QueryTimeout = 3 * time.Second
	}
	if d.RequestTimeout <= 0 {
		d.RequestTimeout = 10 * time.Second
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /ready", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), d.QueryTimeout)
		defer cancel()
		if d.Database == nil || d.Database.Ping(ctx) != nil || d.Profiles == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "not_ready"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
	})
	mux.HandleFunc("GET /api/profile/me", func(w http.ResponseWriter, r *http.Request) {
		authorization := strings.Fields(r.Header.Get("Authorization"))
		if len(authorization) != 2 || !strings.EqualFold(authorization[0], "Bearer") || d.Auth == nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Not authenticated"})
			return
		}
		identity, err := d.Auth.Verify(r.Context(), authorization[1])
		if err != nil {
			status := http.StatusUnauthorized
			message := "Not authenticated"
			if errors.Is(err, auth.ErrUnavailable) {
				status = http.StatusServiceUnavailable
				message = "Authentication unavailable"
			}
			writeJSON(w, status, map[string]string{"error": message})
			return
		}
		if d.Profiles == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "Profile read is not configured"})
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), d.QueryTimeout)
		defer cancel()
		profile, err := d.Profiles.ReadProfile(ctx, identity)
		if err != nil {
			if errors.Is(err, users.ErrNotFound) {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "Profile not found"})
				return
			}
			// Never log driver errors, tokens or full URLs: they may contain secrets.
			d.Logger.Warn("profile read failed", "request_id", w.Header().Get("X-Request-ID"))
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "Profile temporarily unavailable"})
			return
		}
		writeJSON(w, http.StatusOK, profile)
	})
	if d.Realtime != nil {
		mux.HandleFunc("POST /api/realtime/ticket", d.Realtime.Ticket)
	}
	registerCommunity(mux, d)
	registerAccounts(mux, d)
	registerRooms(mux, d)
	registerVoting(mux, d)
	registerMedia(mux, d)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Not found"})
	})
	timed := http.TimeoutHandler(mux, d.RequestTimeout, "{\"error\":\"Request timed out\"}\n")
	origins := make(map[string]bool, len(d.AllowedOrigins))
	for _, origin := range d.AllowedOrigins {
		origins[origin] = true
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var id [16]byte
		_, _ = rand.Read(id[:])
		w.Header().Set("X-Request-ID", hex.EncodeToString(id[:]))
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Add("Vary", "Origin")
		origin := r.Header.Get("Origin")
		if origin != "" && !origins[origin] {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "Origin not allowed"})
			return
		}
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
		if r.Method == http.MethodOptions {
			method := r.Header.Get("Access-Control-Request-Method")
			votePath := strings.HasPrefix(r.URL.Path, "/api/debates/") && strings.HasSuffix(r.URL.Path, "/votes")
			allowPost := (d.Rooms != nil && r.URL.Path == "/api/rooms") || (d.Voting != nil && votePath) || (d.Realtime != nil && r.URL.Path == "/api/realtime/ticket") || (d.Media != nil && r.URL.Path == "/api/livekit/sync")
			accountWrite := d.Accounts != nil && ((method == http.MethodPatch && r.URL.Path == "/api/account/profile") || (method == http.MethodPost && r.URL.Path == "/api/account/onboarding"))
			communityWrite := (d.Forum != nil || d.Notifications != nil || d.Support != nil) && (strings.HasPrefix(r.URL.Path, "/api/forum") || strings.HasPrefix(r.URL.Path, "/api/notifications") || strings.HasPrefix(r.URL.Path, "/api/admin/") || r.URL.Path == "/api/contact") && (method == "POST" || method == "PATCH" || method == "DELETE")
			if method != http.MethodGet && !(method == http.MethodPost && allowPost) && !accountWrite && !communityWrite {
				writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
				return
			}
			methods := "GET"
			if allowPost {
				methods = "GET, POST"
			}
			if accountWrite || communityWrite {
				methods = "GET, " + method
			}
			w.Header().Set("Access-Control-Allow-Methods", methods)
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
		start := time.Now()
		if d.Realtime != nil && r.URL.Path == "/api/realtime/ws" {
			w.Header().Del("Content-Type")
			d.Realtime.Upgrade(w, r)
		} else {
			timed.ServeHTTP(w, r)
		}
		// Never log query strings or Authorization.
		d.Logger.Info("request completed", "request_id", hex.EncodeToString(id[:]), "method", r.Method, "duration_ms", time.Since(start).Milliseconds())
	})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
