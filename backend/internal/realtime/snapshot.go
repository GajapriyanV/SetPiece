package realtime

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/GajapriyanV/SetPiece/backend/internal/chat"
	"github.com/GajapriyanV/SetPiece/backend/internal/debates"
	"github.com/GajapriyanV/SetPiece/backend/internal/voting"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"sort"
	"time"
)

type Brief struct {
	UserID    string  `json:"userId"`
	Username  string  `json:"username"`
	AvatarURL *string `json:"avatarUrl"`
}
type View struct {
	Room           debates.Room
	Profiles       map[string]Brief
	VotesA, VotesB int
	OwnVotes       map[string]string
	Result         *voting.Result
}
type Source interface {
	Read(context.Context, string) (View, error)
	Changed(context.Context, map[string]int64) ([]string, error)
}
type PostgresSource struct{ pool *pgxpool.Pool }

func NewPostgresSource(pool *pgxpool.Pool) *PostgresSource { return &PostgresSource{pool} }
func (s *PostgresSource) Changed(ctx context.Context, versions map[string]int64) ([]string, error) {
	ids := make([]string, 0, len(versions))
	for id := range versions {
		ids = append(ids, id)
	}
	rows, e := s.pool.Query(ctx, "SELECT id,revision FROM setpiece_runtime.rooms WHERE id=ANY($1)", ids)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var id string
		var revision int64
		if e = rows.Scan(&id, &revision); e != nil {
			return nil, e
		}
		if versions[id] != revision {
			out = append(out, id)
		}
	}
	return out, rows.Err()
}

// One repeatable-read transaction prevents mixing members, votes, ratings and
// room revisions from different commits. Caller checks membership before delivery.
func (s *PostgresSource) Read(ctx context.Context, id string) (View, error) {
	tx, e := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if e != nil {
		return View{}, e
	}
	defer func() {
		c, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = tx.Rollback(c)
	}()
	r, e := debates.ReadRoomTx(ctx, tx, id, false)
	if e != nil {
		return View{}, e
	}
	v := View{Room: r, Profiles: map[string]Brief{}, OwnVotes: map[string]string{}}
	ids := []string{}
	for id := range r.Members {
		ids = append(ids, id)
	}
	if r.DebaterA != "" {
		ids = append(ids, r.DebaterA, r.DebaterB)
	}
	rows, e := tx.Query(ctx, "SELECT id::text,coalesce(username,'Member'),avatar_url FROM public.profiles WHERE id=ANY($1::uuid[])", ids)
	if e != nil {
		return v, e
	}
	for rows.Next() {
		var b Brief
		if e = rows.Scan(&b.UserID, &b.Username, &b.AvatarURL); e != nil {
			rows.Close()
			return v, e
		}
		v.Profiles[b.UserID] = b
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return v, e
	}
	if r.DebateID != "" {
		e = tx.QueryRow(ctx, "SELECT count(*) FILTER(WHERE side='a'),count(*) FILTER(WHERE side='b') FROM public.votes WHERE debate_id=$1", r.DebateID).Scan(&v.VotesA, &v.VotesB)
		if e != nil {
			return v, e
		}
		rows, e = tx.Query(ctx, "SELECT user_id::text,side FROM public.votes WHERE debate_id=$1 AND user_id=ANY($2::uuid[])", r.DebateID, ids)
		if e != nil {
			return v, e
		}
		for rows.Next() {
			var user, side string
			if e = rows.Scan(&user, &side); e != nil {
				rows.Close()
				return v, e
			}
			v.OwnVotes[user] = side
		}
		e = rows.Err()
		rows.Close()
		if e != nil {
			return v, e
		}
		var data []byte
		e = tx.QueryRow(ctx, "SELECT result FROM setpiece_runtime.results WHERE debate_id=$1", r.DebateID).Scan(&data)
		if e == nil {
			v.Result = &voting.Result{}
			if e = json.Unmarshal(data, v.Result); e != nil {
				return v, e
			}
		} else if !errors.Is(e, pgx.ErrNoRows) {
			return v, e
		}
	}
	return v, tx.Commit(ctx)
}
func ms(t *time.Time) any {
	if t == nil {
		return nil
	}
	return t.UnixMilli()
}
func (s View) brief(id string) *Brief {
	if id == "" {
		return nil
	}
	b, ok := s.Profiles[id]
	if !ok {
		b = Brief{UserID: id, Username: "Member"}
	}
	return &b
}
func (s View) sides() (a, b *Brief, spectators []*Brief) {
	spectators = []*Brief{}
	for _, id := range memberIDs(s.Room) {
		m := s.Room.Members[id]
		switch m.Side {
		case "a":
			a = s.brief(id)
		case "b":
			b = s.brief(id)
		default:
			spectators = append(spectators, s.brief(id))
		}
	}
	return
}
func memberIDs(r debates.Room) []string {
	ids := []string{}
	for id := range r.Members {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}
func skipIDs(r debates.Room) []string {
	ids := []string{}
	for id := range r.SkipVoters {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}
func (s View) snapshot(user string, history []chat.Message, now time.Time) map[string]any {
	r := s.Room
	topic := r.Topic()
	members := []any{}
	for _, id := range memberIDs(r) {
		m := r.Members[id]
		b := s.brief(id)
		var side any
		if m.Side != "" {
			side = m.Side
		}
		members = append(members, map[string]any{"userId": id, "username": b.Username, "avatarUrl": b.AvatarURL, "side": side, "isReady": m.Ready, "joinedAt": m.JoinedAt.UnixMilli(), "departAt": ms(m.DepartAt)})
	}
	var phase any
	if p := r.Phase(); p != nil {
		phase = map[string]any{"name": p.Name, "speaker": p.Speaker, "endsAt": ms(r.Deadline), "index": r.PhaseIndex}
	}
	var own any
	if v := s.OwnVotes[user]; v != "" {
		own = v
	}
	var featured any
	var sidePick, countdown, votingDeadline, closing any
	if r.Featured && r.Status == "lobby" {
		sidePick = ms(r.Deadline)
	}
	if r.Status == "countdown" {
		countdown = ms(r.Deadline)
	}
	if r.Status == "voting" {
		votingDeadline = ms(r.Deadline)
		phase = map[string]any{"name": "voting", "speaker": nil, "endsAt": votingDeadline, "index": 6}
	}
	if r.Status == "closing" {
		closing = ms(r.Deadline)
	}
	if r.Featured {
		featured = map[string]any{"currentTopicIndex": r.TopicIndex, "debatesCompleted": r.Completed, "maxDebates": 5, "topicCount": len(r.Topics), "closingAt": closing}
	}
	a, b, _ := s.sides()
	if r.DebaterA != "" {
		a = s.brief(r.DebaterA)
		b = s.brief(r.DebaterB)
	}
	var debateID any
	if r.DebateID != "" {
		debateID = r.DebateID
	}
	return map[string]any{"roomId": r.ID, "revision": r.Revision, "serverTime": now.UnixMilli(), "status": r.Status, "topic": topic.Topic, "sideALabel": topic.SideA, "sideBLabel": topic.SideB, "members": members, "debaterA": a, "debaterB": b, "phase": phase, "chat": history, "debateId": debateID, "votes": map[string]int{"a": s.VotesA, "b": s.VotesB}, "ownVote": own, "results": s.Result, "isFeatured": r.Featured, "featuredMeta": featured, "countdownEndsAt": countdown, "votingEndsAt": votingDeadline, "sidePickEndsAt": sidePick, "closingAt": closing, "recoveryEndsAt": ms(r.RecoveryAt), "deadline": ms(r.Deadline), "skipVotes": map[string]any{"count": len(r.SkipVoters), "required": 2, "votedUserIds": skipIDs(r)}}
}
