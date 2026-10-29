package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/GajapriyanV/SetPiece/backend/internal/application"
	"io"
	"net/http"
)

type RuntimeControl interface {
	SetDraining(bool)
	Draining() bool
	ActiveDebates(context.Context) (int, error)
}

func registerRuntime(mux *http.ServeMux, d Dependencies) {
	if d.Runtime == nil || d.RuntimeAdmin == nil {
		return
	}
	handler := func(w http.ResponseWriter, r *http.Request) {
		id, ok := roomIdentity(w, r, d)
		if !ok {
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), d.QueryTimeout)
		defer cancel()
		if err := d.RuntimeAdmin(ctx, id.ID); err != nil {
			status := 503
			if errors.Is(err, application.ErrForbidden) {
				status = 403
			}
			writeJSON(w, status, map[string]string{"error": "Runtime administration unavailable"})
			return
		}
		if r.Method == http.MethodPost {
			var input struct {
				Draining *bool `json:"draining"`
			}
			decoder := json.NewDecoder(r.Body)
			decoder.DisallowUnknownFields()
			if decoder.Decode(&input) != nil || input.Draining == nil || decoder.Decode(&struct{}{}) != io.EOF {
				writeJSON(w, 400, map[string]string{"error": "Expected a draining boolean"})
				return
			}
			d.Runtime.SetDraining(*input.Draining)
		}
		active, err := d.Runtime.ActiveDebates(ctx)
		if err != nil {
			writeJSON(w, 503, map[string]string{"error": "Runtime status unavailable"})
			return
		}
		draining := d.Runtime.Draining()
		writeJSON(w, 200, map[string]any{"draining": draining, "activeDebates": active, "safeToStop": draining && active == 0})
	}
	mux.HandleFunc("GET /api/admin/runtime", handler)
	mux.HandleFunc("POST /api/admin/runtime/drain", handler)
}
