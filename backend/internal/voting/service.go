// Package voting owns vote acceptance and exactly-once result/rating transactions.
package voting

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/GajapriyanV/SetPiece/backend/internal/ownership"
	"math"
	"regexp"
	"time"

	"github.com/GajapriyanV/SetPiece/backend/internal/auth"
	"github.com/GajapriyanV/SetPiece/backend/internal/debates"
	"github.com/GajapriyanV/SetPiece/backend/internal/leaderboard"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
var (
	ErrInvalid   = errors.New("invalid vote")
	ErrForbidden = errors.New("not eligible to vote")
	ErrConflict  = errors.New("first vote is final")
	ErrClosed    = errors.New("voting is not open")
	ErrNotDue    = errors.New("voting has not closed")
)

type Speaker struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	OldElo   int    `json:"oldElo"`
	NewElo   int    `json:"newElo"`
	EloDelta int    `json:"eloDelta"`
}
type Result struct {
	WinnerID   *string   `json:"winnerId"`
	Result     string    `json:"result"`
	VotesA     int       `json:"votesA"`
	VotesB     int       `json:"votesB"`
	EloChange  int       `json:"eloChange"`
	DebaterA   Speaker   `json:"debaterA"`
	DebaterB   Speaker   `json:"debaterB"`
	FinishedAt time.Time `json:"finishedAt"`
}
type State struct {
	RoomID   string  `json:"roomId"`
	DebateID string  `json:"debateId"`
	Revision int64   `json:"revision"`
	Status   string  `json:"status"`
	VotesA   int     `json:"votesA"`
	VotesB   int     `json:"votesB"`
	OwnVote  *string `json:"ownVote"`
	Result   *Result `json:"result"`
}
type Service struct {
	pool  *pgxpool.Pool
	fence *ownership.Lease
}

func NewService(pool *pgxpool.Pool) *Service { return &Service{pool: pool} }
func NewServiceOwned(pool *pgxpool.Pool, fence *ownership.Lease) *Service {
	return &Service{pool: pool, fence: fence}
}
func rollback(tx pgx.Tx) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	_ = tx.Rollback(ctx)
}

// All writers lock room -> debate -> profiles ordered by ID. The mapping is
// immutable and prevents this service from taking ownership of legacy debates.
func load(ctx context.Context, tx pgx.Tx, id string, lock bool) (debates.Room, string, error) {
	var roomID string
	if e := tx.QueryRow(ctx, "SELECT room_id FROM setpiece_runtime.debates WHERE debate_id=$1", id).Scan(&roomID); e != nil {
		if errors.Is(e, pgx.ErrNoRows) {
			return debates.Room{}, "", debates.ErrNotFound
		}
		return debates.Room{}, "", e
	}
	r, e := debates.ReadRoomTx(ctx, tx, roomID, lock)
	if e != nil {
		return r, "", e
	}
	query := "SELECT status FROM public.debates WHERE id=$1"
	if lock {
		query += " FOR UPDATE"
	}
	var status string
	e = tx.QueryRow(ctx, query, id).Scan(&status)
	return r, status, e
}
func state(ctx context.Context, tx pgx.Tx, r debates.Room, id, user, status string) (State, error) {
	out := State{RoomID: r.ID, DebateID: id, Revision: r.Revision, Status: status}
	if e := tx.QueryRow(ctx, `SELECT count(*) FILTER(WHERE side='a'),count(*) FILTER(WHERE side='b'),
 max(side) FILTER(WHERE user_id::text=$2) FROM public.votes WHERE debate_id=$1`, id, user).Scan(&out.VotesA, &out.VotesB, &out.OwnVote); e != nil {
		return State{}, e
	}
	var data []byte
	e := tx.QueryRow(ctx, "SELECT result FROM setpiece_runtime.results WHERE debate_id=$1", id).Scan(&data)
	if errors.Is(e, pgx.ErrNoRows) {
		return out, nil
	}
	if e != nil {
		return State{}, e
	}
	out.Result = &Result{}
	if e = json.Unmarshal(data, out.Result); e != nil {
		return State{}, e
	}
	return out, nil
}
func (s *Service) Snapshot(ctx context.Context, id string, identity auth.Identity) (State, error) {
	if !uuidPattern.MatchString(id) {
		return State{}, ErrInvalid
	}
	if identity.ID == "" {
		return State{}, ErrForbidden
	}
	tx, e := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if e != nil {
		return State{}, e
	}
	defer rollback(tx)
	r, status, e := load(ctx, tx, id, false)
	if e != nil {
		return State{}, e
	}
	out, e := state(ctx, tx, r, id, identity.ID, status)
	if e != nil {
		return State{}, e
	}
	_, member := r.Members[identity.ID]
	if !member && r.Creator != identity.ID && out.OwnVote == nil && (out.Result == nil || (out.Result.DebaterA.ID != identity.ID && out.Result.DebaterB.ID != identity.ID)) {
		return State{}, ErrForbidden
	}
	if e = tx.Commit(ctx); e != nil {
		return State{}, e
	}
	return out, nil
}
func (s *Service) Cast(ctx context.Context, id string, identity auth.Identity, side string) (State, error) {
	if !uuidPattern.MatchString(id) {
		return State{}, ErrInvalid
	}
	if side != "a" && side != "b" {
		return State{}, ErrInvalid
	}
	if identity.ID == "" {
		return State{}, ErrForbidden
	}
	tx, e := s.pool.Begin(ctx)
	if e != nil {
		return State{}, e
	}
	defer rollback(tx)
	if s.fence != nil {
		if e = s.fence.Check(ctx, tx); e != nil {
			return State{}, e
		}
	}
	r, status, e := load(ctx, tx, id, true)
	if e != nil {
		return State{}, e
	}
	var existing string
	e = tx.QueryRow(ctx, "SELECT side FROM public.votes WHERE debate_id=$1 AND user_id=$2", id, identity.ID).Scan(&existing)
	if e == nil {
		if existing != side {
			return State{}, ErrConflict
		}
		// Receipt retries are safe even after closure/room reset; no vote is rewritten.
		out, e := state(ctx, tx, r, id, identity.ID, status)
		if e != nil {
			return State{}, e
		}
		if e = tx.Commit(ctx); e != nil {
			return State{}, e
		}
		return out, nil
	}
	if !errors.Is(e, pgx.ErrNoRows) {
		return State{}, e
	}
	m, member := r.Members[identity.ID]
	if !member || m.DepartAt != nil || identity.ID == r.DebaterA || identity.ID == r.DebaterB {
		return State{}, ErrForbidden
	}
	var now time.Time
	// clock_timestamp, not transaction-start now(): waiting for a lock cannot
	// admit a vote using a timestamp captured before the window actually closed.
	if e = tx.QueryRow(ctx, "SELECT clock_timestamp()").Scan(&now); e != nil {
		return State{}, e
	}
	if r.DebateID != id || r.Status != "voting" || status != "voting" || r.Deadline == nil || !now.Before(*r.Deadline) {
		return State{}, ErrClosed
	}
	if _, e = tx.Exec(ctx, "INSERT INTO public.votes(debate_id,user_id,side,created_at) VALUES($1,$2,$3,$4)", id, identity.ID, side, now); e != nil {
		return State{}, e
	}
	if e = debates.SaveRoomSnapshotTx(ctx, tx, &r); e != nil {
		return State{}, e
	}
	out, e := state(ctx, tx, r, id, identity.ID, status)
	if e != nil {
		return State{}, e
	}
	if e = tx.Commit(ctx); e != nil {
		return State{}, e
	}
	return out, nil
}

// Finalize is internal-only. HTTP/WS may cast/read, never choose or force a result.
func (s *Service) Finalize(ctx context.Context, id string) (State, error) {
	if !uuidPattern.MatchString(id) {
		return State{}, ErrInvalid
	}
	tx, e := s.pool.Begin(ctx)
	if e != nil {
		return State{}, e
	}
	defer rollback(tx)
	if s.fence != nil {
		if e = s.fence.Check(ctx, tx); e != nil {
			return State{}, e
		}
	}
	r, status, e := load(ctx, tx, id, true)
	if e != nil {
		return State{}, e
	}
	out, e := state(ctx, tx, r, id, "", status)
	if e != nil {
		return State{}, e
	}
	if out.Result != nil {
		if e = tx.Commit(ctx); e != nil {
			return State{}, e
		}
		return out, nil
	}
	var now time.Time
	if e = tx.QueryRow(ctx, "SELECT clock_timestamp()").Scan(&now); e != nil {
		return State{}, e
	}
	if r.DebateID != id || status != "voting" || (r.Status != "voting" && r.Status != "awaiting_result") {
		return State{}, ErrClosed
	}
	if r.Status == "voting" && (r.Deadline == nil || now.Before(*r.Deadline)) {
		return State{}, ErrNotDue
	}
	if r.DebaterA == "" || r.DebaterB == "" || r.DebaterA == r.DebaterB {
		return State{}, ErrInvalid
	}
	rows, e := tx.Query(ctx, "SELECT id::text,coalesce(username,'Unknown'),elo FROM public.profiles WHERE id IN ($1,$2) ORDER BY id FOR NO KEY UPDATE", r.DebaterA, r.DebaterB)
	if e != nil {
		return State{}, e
	}
	speakers := map[string]Speaker{}
	for rows.Next() {
		var p Speaker
		if e = rows.Scan(&p.ID, &p.Username, &p.OldElo); e != nil {
			rows.Close()
			return State{}, e
		}
		speakers[p.ID] = p
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return State{}, e
	}
	if len(speakers) != 2 {
		return State{}, ErrInvalid
	}
	result := Result{Result: "draw", VotesA: out.VotesA, VotesB: out.VotesB, DebaterA: speakers[r.DebaterA], DebaterB: speakers[r.DebaterB], FinishedAt: now}
	score := 0.5
	if out.VotesA > out.VotesB {
		result.Result = "side_a"
		winner := r.DebaterA
		result.WinnerID = &winner
		score = 1
	}
	if out.VotesB > out.VotesA {
		result.Result = "side_b"
		winner := r.DebaterB
		result.WinnerID = &winner
		score = 0
	}
	ratings := leaderboard.Calculate(result.DebaterA.OldElo, result.DebaterB.OldElo, score)
	result.DebaterA.NewElo = ratings.A
	result.DebaterA.EloDelta = ratings.DeltaA
	result.DebaterB.NewElo = ratings.B
	result.DebaterB.EloDelta = ratings.DeltaB
	result.EloChange = int(math.Abs(float64(ratings.DeltaA))) // legacy field compatibility
	for _, p := range []Speaker{result.DebaterA, result.DebaterB} {
		win, loss, draw := 0, 0, 0
		if result.WinnerID == nil {
			draw = 1
		} else if *result.WinnerID == p.ID {
			win = 1
		} else {
			loss = 1
		}
		if _, e = tx.Exec(ctx, `UPDATE public.profiles SET elo=$2,wins=wins+$3,losses=losses+$4,draws=draws+$5,debates_count=debates_count+1,updated_at=$6 WHERE id=$1`,
			p.ID, p.NewElo, win, loss, draw, now); e != nil {
			return State{}, e
		}
	}
	if _, e = tx.Exec(ctx, `UPDATE public.debates SET status='finished',winner_id=$2,result=$3,votes_a=$4,votes_b=$5,elo_change=$6,finished_at=$7 WHERE id=$1`,
		id, result.WinnerID, result.Result, result.VotesA, result.VotesB, result.EloChange, now); e != nil {
		return State{}, e
	}
	data, e := json.Marshal(result)
	if e != nil {
		return State{}, e
	}
	if _, e = tx.Exec(ctx, "INSERT INTO setpiece_runtime.results(debate_id,finalized_at,result) VALUES($1,$2,$3)", id, now, data); e != nil {
		return State{}, e
	}
	r.Status = "results"
	deadline := now.Add(time.Minute)
	r.Deadline = &deadline
	if e = debates.SaveRoomSnapshotTx(ctx, tx, &r); e != nil {
		return State{}, e
	}
	out.Status = "finished"
	out.Revision = r.Revision
	out.Result = &result
	if e = tx.Commit(ctx); e != nil {
		return State{}, e
	}
	return out, nil
}
func (s *Service) Run(ctx context.Context, ticks <-chan time.Time, onError func(error)) {
	for {
		select {
		case <-ctx.Done():
			return
		case _, ok := <-ticks:
			if !ok {
				return
			}
			batch, cancel := context.WithTimeout(ctx, 3*time.Second)
			e := s.finalizeDue(batch)
			cancel()
			if e != nil && onError != nil {
				onError(e)
			}
		}
	}
}
func (s *Service) finalizeDue(ctx context.Context) error {
	rows, e := s.pool.Query(ctx, `SELECT d.debate_id::text FROM setpiece_runtime.debates d
 JOIN setpiece_runtime.rooms r ON r.id=d.room_id
 WHERE d.active AND NOT r.closed AND (r.snapshot->>'status'='awaiting_result'
 OR (r.snapshot->>'status'='voting' AND r.next_due<=clock_timestamp()))
 ORDER BY r.next_due NULLS FIRST,r.id LIMIT 100`)
	if e != nil {
		return e
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if e = rows.Scan(&id); e != nil {
			rows.Close()
			return e
		}
		ids = append(ids, id)
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return e
	}
	var first error
	for _, id := range ids {
		if _, e = s.Finalize(ctx, id); e != nil && !errors.Is(e, ErrClosed) && !errors.Is(e, ErrNotDue) && first == nil {
			first = e
		}
	}
	return first
}
