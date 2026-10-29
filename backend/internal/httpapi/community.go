package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/GajapriyanV/SetPiece/backend/internal/application"
	"github.com/GajapriyanV/SetPiece/backend/internal/forum"
	"github.com/GajapriyanV/SetPiece/backend/internal/support"
	"io"
	"net/http"
	"strconv"
)

type ForumService interface {
	List(context.Context, string, string, int) (json.RawMessage, error)
	Detail(context.Context, string, string, int) (json.RawMessage, error)
	Create(context.Context, string, forum.NewThread) (json.RawMessage, error)
	Reply(context.Context, string, string, forum.NewReply) (json.RawMessage, error)
	Like(context.Context, string, string, string, bool) (json.RawMessage, error)
	Delete(context.Context, string, string, string) (json.RawMessage, error)
	Update(context.Context, string, string, forum.Patch) (json.RawMessage, error)
	Report(context.Context, string, forum.Report) (json.RawMessage, error)
	Reports(context.Context, string, string) (json.RawMessage, error)
	Review(context.Context, string, string) (json.RawMessage, error)
}
type NotificationService interface {
	List(context.Context, string) (json.RawMessage, error)
	Read(context.Context, string, string) (json.RawMessage, error)
}
type SupportService interface {
	Create(context.Context, string, support.Ticket) (json.RawMessage, error)
	List(context.Context, string, string) (json.RawMessage, error)
	Review(context.Context, string, string) (json.RawMessage, error)
}

func communityError(w http.ResponseWriter, e error) {
	status, message := 503, "Service temporarily unavailable"
	switch {
	case errors.Is(e, application.ErrInvalid):
		status, message = 400, "Invalid request"
	case errors.Is(e, application.ErrForbidden):
		status, message = 403, "Forbidden"
	case errors.Is(e, application.ErrNotFound):
		status, message = 404, "Not found"
	case errors.Is(e, application.ErrClosed):
		status, message = 409, "Thread is closed"
	case errors.Is(e, application.ErrReadOnly):
		message = "Writes are disabled in this environment"
	}
	writeJSON(w, status, map[string]string{"error": message})
}
func decodeCommunity(r *http.Request, target any) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if dec.Decode(target) != nil || dec.Decode(&struct{}{}) != io.EOF {
		return application.ErrInvalid
	}
	return nil
}
func pageNumber(r *http.Request, key string) (int, error) {
	v := r.URL.Query().Get(key)
	if v == "" {
		return 1, nil
	}
	n, e := strconv.Atoi(v)
	if e != nil || n < 1 || n > 100000 {
		return 0, application.ErrInvalid
	}
	return n, nil
}
func registerCommunity(mux *http.ServeMux, d Dependencies) {
	add := func(pattern string, authenticated bool, status int, fn func(context.Context, string, *http.Request) (json.RawMessage, error)) {
		mux.HandleFunc(pattern, func(w http.ResponseWriter, r *http.Request) {
			user := ""
			if authenticated || r.Header.Get("Authorization") != "" {
				id, ok := roomIdentity(w, r, d)
				if !ok {
					return
				}
				user = id.ID
			}
			ctx, cancel := context.WithTimeout(r.Context(), d.QueryTimeout)
			defer cancel()
			result, e := fn(ctx, user, r)
			if e != nil {
				communityError(w, e)
				return
			}
			writeJSON(w, status, result)
		})
	}
	if d.Forum != nil {
		add("GET /api/forum", false, 200, func(ctx context.Context, user string, r *http.Request) (json.RawMessage, error) {
			p, e := pageNumber(r, "page")
			if e != nil {
				return nil, e
			}
			return d.Forum.List(ctx, r.URL.Query().Get("flair"), r.URL.Query().Get("sort"), p)
		})
		add("POST /api/forum", true, 201, func(ctx context.Context, user string, r *http.Request) (json.RawMessage, error) {
			var in forum.NewThread
			if e := decodeCommunity(r, &in); e != nil {
				return nil, e
			}
			return d.Forum.Create(ctx, user, in)
		})
		add("GET /api/forum/{id}", false, 200, func(ctx context.Context, user string, r *http.Request) (json.RawMessage, error) {
			p, e := pageNumber(r, "reply_page")
			if e != nil {
				return nil, e
			}
			return d.Forum.Detail(ctx, user, r.PathValue("id"), p)
		})
		add("PATCH /api/forum/{id}", true, 200, func(ctx context.Context, user string, r *http.Request) (json.RawMessage, error) {
			var in forum.Patch
			if e := decodeCommunity(r, &in); e != nil {
				return nil, e
			}
			return d.Forum.Update(ctx, user, r.PathValue("id"), in)
		})
		add("POST /api/forum/{id}/reply", true, 201, func(ctx context.Context, user string, r *http.Request) (json.RawMessage, error) {
			var in forum.NewReply
			if e := decodeCommunity(r, &in); e != nil {
				return nil, e
			}
			return d.Forum.Reply(ctx, user, r.PathValue("id"), in)
		})
		for _, route := range []struct{ path, kind string }{{"/api/forum/{id}", "thread"}, {"/api/forum/reply/{id}", "reply"}} {
			add("DELETE "+route.path, true, 200, func(ctx context.Context, user string, r *http.Request) (json.RawMessage, error) {
				return d.Forum.Delete(ctx, user, route.kind, r.PathValue("id"))
			})
			add("POST "+route.path+"/like", true, 200, func(ctx context.Context, user string, r *http.Request) (json.RawMessage, error) {
				var in struct {
					Liked *bool `json:"liked"`
				}
				if e := decodeCommunity(r, &in); e != nil {
					return nil, e
				}
				if in.Liked == nil {
					return nil, application.ErrInvalid
				}
				return d.Forum.Like(ctx, user, route.kind, r.PathValue("id"), *in.Liked)
			})
		}
		add("POST /api/forum/report", true, 201, func(ctx context.Context, user string, r *http.Request) (json.RawMessage, error) {
			var in forum.Report
			if e := decodeCommunity(r, &in); e != nil {
				return nil, e
			}
			return d.Forum.Report(ctx, user, in)
		})
		add("GET /api/admin/reports", true, 200, func(ctx context.Context, user string, r *http.Request) (json.RawMessage, error) {
			return d.Forum.Reports(ctx, user, r.URL.Query().Get("filter"))
		})
		add("PATCH /api/admin/reports/{id}", true, 200, func(ctx context.Context, user string, r *http.Request) (json.RawMessage, error) {
			return d.Forum.Review(ctx, user, r.PathValue("id"))
		})
	}
	if d.Notifications != nil {
		add("GET /api/notifications", true, 200, func(ctx context.Context, user string, r *http.Request) (json.RawMessage, error) {
			return d.Notifications.List(ctx, user)
		})
		add("PATCH /api/notifications", true, 200, func(ctx context.Context, user string, r *http.Request) (json.RawMessage, error) {
			return d.Notifications.Read(ctx, user, "")
		})
		add("PATCH /api/notifications/{id}", true, 200, func(ctx context.Context, user string, r *http.Request) (json.RawMessage, error) {
			return d.Notifications.Read(ctx, user, r.PathValue("id"))
		})
	}
	if d.Support != nil {
		add("POST /api/contact", true, 200, func(ctx context.Context, user string, r *http.Request) (json.RawMessage, error) {
			var in support.Ticket
			if e := decodeCommunity(r, &in); e != nil {
				return nil, e
			}
			return d.Support.Create(ctx, user, in)
		})
		add("GET /api/admin/contact", true, 200, func(ctx context.Context, user string, r *http.Request) (json.RawMessage, error) {
			return d.Support.List(ctx, user, r.URL.Query().Get("filter"))
		})
		add("PATCH /api/admin/contact/{id}", true, 200, func(ctx context.Context, user string, r *http.Request) (json.RawMessage, error) {
			return d.Support.Review(ctx, user, r.PathValue("id"))
		})
	}
}
