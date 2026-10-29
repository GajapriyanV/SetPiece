package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/GajapriyanV/SetPiece/backend/internal/auth"
	"github.com/GajapriyanV/SetPiece/backend/internal/debates"
	"github.com/GajapriyanV/SetPiece/backend/internal/voting"
)

type VotingService interface {
	Cast(context.Context, string, auth.Identity, string) (voting.State, error)
	Snapshot(context.Context, string, auth.Identity) (voting.State, error)
}

func voteError(w http.ResponseWriter, e error) {
	status, message := 503, "Voting temporarily unavailable"
	switch {
	case errors.Is(e, voting.ErrInvalid):
		status, message = 400, "Invalid vote"
	case errors.Is(e, voting.ErrForbidden):
		status, message = 403, "Not eligible to vote"
	case errors.Is(e, voting.ErrConflict):
		status, message = 409, "Your first vote is final"
	case errors.Is(e, voting.ErrClosed):
		status, message = 409, "Voting is closed"
	case errors.Is(e, debates.ErrNotFound):
		status, message = 404, "Debate not found"
	}
	writeJSON(w, status, map[string]string{"error": message})
}
func registerVoting(mux *http.ServeMux, d Dependencies) {
	if d.Voting == nil {
		return
	}
	mux.HandleFunc("POST /api/debates/{debateId}/votes", func(w http.ResponseWriter, r *http.Request) {
		identity, ok := roomIdentity(w, r, d)
		if !ok {
			return
		}
		var input struct {
			Side string `json:"side"`
		}
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		if decoder.Decode(&input) != nil || decoder.Decode(&struct{}{}) != io.EOF {
			voteError(w, voting.ErrInvalid)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), d.QueryTimeout)
		defer cancel()
		result, e := d.Voting.Cast(ctx, r.PathValue("debateId"), identity, input.Side)
		if e != nil {
			voteError(w, e)
			return
		}
		writeJSON(w, 200, result)
	})
	mux.HandleFunc("GET /api/debates/{debateId}/votes", func(w http.ResponseWriter, r *http.Request) {
		identity, ok := roomIdentity(w, r, d)
		if !ok {
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), d.QueryTimeout)
		defer cancel()
		result, e := d.Voting.Snapshot(ctx, r.PathValue("debateId"), identity)
		if e != nil {
			voteError(w, e)
			return
		}
		writeJSON(w, 200, result)
	})
}
