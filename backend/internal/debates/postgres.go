package debates

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/GajapriyanV/SetPiece/backend/internal/ownership"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository interface {
	Create(context.Context, Room) (Room, error)
	Read(context.Context, string) (Room, error)
	Update(context.Context, string, func(*Room) error) (Room, error)
	Page(context.Context, string, int) ([]Room, error)
	Due(context.Context, time.Time, int) ([]Room, error)
}
type Postgres struct {
	pool  *pgxpool.Pool
	fence *ownership.Lease
}

func NewPostgres(pool *pgxpool.Pool) *Postgres { return &Postgres{pool: pool} }
func NewPostgresOwned(pool *pgxpool.Pool, fence *ownership.Lease) *Postgres {
	return &Postgres{pool: pool, fence: fence}
}
func rollback(tx pgx.Tx) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	_ = tx.Rollback(ctx)
}
func snapshot(r Room) ([]byte, error) { r.Members = nil; return json.Marshal(r) }
func (p *Postgres) Create(ctx context.Context, r Room) (Room, error) {
	data, e := snapshot(r)
	if e != nil {
		return Room{}, e
	}
	tx, e := p.pool.Begin(ctx)
	if e != nil {
		return Room{}, e
	}
	defer rollback(tx)
	if p.fence != nil {
		if e = p.fence.Check(ctx, tx); e != nil {
			return Room{}, e
		}
	}
	_, e = tx.Exec(ctx, "INSERT INTO setpiece_runtime.rooms(id,revision,capacity,snapshot,next_due,creator_id) VALUES ($1,$2,$3,$4,$5,$6)", r.ID, r.Revision, r.Capacity(), data, r.NextDue(), r.Creator)
	if e != nil {
		return Room{}, e
	}
	if e = tx.Commit(ctx); e != nil {
		return Room{}, e
	}
	return r, nil
}
func read(ctx context.Context, tx pgx.Tx, id string, lock bool) (Room, error) {
	query := "SELECT snapshot,revision FROM setpiece_runtime.rooms WHERE id=$1"
	if lock {
		query += " FOR UPDATE"
	}
	var data []byte
	var revision int64
	if e := tx.QueryRow(ctx, query, id).Scan(&data, &revision); e != nil {
		if errors.Is(e, pgx.ErrNoRows) {
			return Room{}, ErrNotFound
		}
		return Room{}, e
	}
	var r Room
	if e := json.Unmarshal(data, &r); e != nil {
		return Room{}, e
	}
	r.Revision = revision
	r.Members = map[string]Member{}
	rows, e := tx.Query(ctx, "SELECT user_id::text,coalesce(side,''),ready,slot,joined_at,depart_at,restarting FROM setpiece_runtime.members WHERE room_id=$1 ORDER BY slot", id)
	if e != nil {
		return Room{}, e
	}
	defer rows.Close()
	for rows.Next() {
		var m Member
		if e = rows.Scan(&m.UserID, &m.Side, &m.Ready, &m.Slot, &m.JoinedAt, &m.DepartAt, &m.Restart); e != nil {
			return Room{}, e
		}
		r.Members[m.UserID] = m
	}
	return r, rows.Err()
}
func (p *Postgres) Read(ctx context.Context, id string) (Room, error) {
	tx, e := p.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if e != nil {
		return Room{}, e
	}
	defer rollback(tx)
	r, e := read(ctx, tx, id, false)
	if e != nil {
		return Room{}, e
	}
	if e = tx.Commit(ctx); e != nil {
		return Room{}, e
	}
	return r, nil
}
func (p *Postgres) Update(ctx context.Context, id string, change func(*Room) error) (Room, error) {
	tx, e := p.pool.Begin(ctx)
	if e != nil {
		return Room{}, e
	}
	defer rollback(tx)
	if p.fence != nil {
		if e = p.fence.Check(ctx, tx); e != nil {
			return Room{}, e
		}
	}
	r, e := read(ctx, tx, id, true)
	if e != nil {
		return Room{}, e
	}
	previous := r
	if e = change(&r); e != nil {
		return Room{}, e
	}
	// Lock order for future finalization: room, debate, then profiles in ID order.
	if previous.DebateID != "" {
		var status string
		if e = tx.QueryRow(ctx, "SELECT status FROM public.debates WHERE id=$1 FOR UPDATE", previous.DebateID).Scan(&status); e != nil {
			return Room{}, e
		}
		if r.Status == "results" && previous.Status != "results" && status != "finished" {
			return Room{}, ErrNotFinalized
		}
		if r.DebateID != previous.DebateID {
			if status != "finished" {
				if _, e = tx.Exec(ctx, "UPDATE public.debates SET status='cancelled',finished_at=clock_timestamp() WHERE id=$1 AND status IN ('live','voting')", previous.DebateID); e != nil {
					return Room{}, e
				}
			}
			if _, e = tx.Exec(ctx, "UPDATE setpiece_runtime.debates SET active=false WHERE debate_id=$1", previous.DebateID); e != nil {
				return Room{}, e
			}
		} else if r.Status == "voting" || r.Status == "awaiting_result" {
			if _, e = tx.Exec(ctx, "UPDATE public.debates SET status='voting' WHERE id=$1 AND status='live'", r.DebateID); e != nil {
				return Room{}, e
			}
		}
	}
	if r.DebateID != "" && r.DebateID != previous.DebateID {
		topic := r.Topic()
		if _, e = tx.Exec(ctx, `INSERT INTO public.debates(id,room_code,topic,side_a_label,side_b_label,debater_a_id,debater_b_id,status,started_at) VALUES($1,$2,$3,$4,$5,$6,$7,'live',$8)`,
			r.DebateID, r.ID, topic.Topic, topic.SideA, topic.SideB, r.DebaterA, r.DebaterB, r.Deadline.Add(-5*time.Second)); e != nil {
			return Room{}, e
		}
		if _, e = tx.Exec(ctx, "INSERT INTO setpiece_runtime.debates(debate_id,room_id) VALUES($1,$2)", r.DebateID, r.ID); e != nil {
			return Room{}, e
		}
	}
	if e = SaveRoomSnapshotTx(ctx, tx, &r); e != nil {
		return Room{}, e
	}
	// At most 50 rows. Replacing within the locked transaction avoids transient
	// unique-side conflicts when switching assignments; readers see one snapshot.
	if _, e = tx.Exec(ctx, "DELETE FROM setpiece_runtime.members WHERE room_id=$1", id); e != nil {
		return Room{}, e
	}
	for _, m := range r.Members {
		if _, e = tx.Exec(ctx, `INSERT INTO setpiece_runtime.members(room_id,capacity,user_id,slot,side,ready,joined_at,depart_at,restarting) VALUES($1,$2,$3,$4,nullif($5,''),$6,$7,$8,$9)`,
			id, r.Capacity(), m.UserID, m.Slot, m.Side, m.Ready, m.JoinedAt, m.DepartAt, m.Restart); e != nil {
			return Room{}, e
		}
	}
	if e = tx.Commit(ctx); e != nil {
		return Room{}, e
	}
	return r, nil // No snapshot is published before commit.
}
func (p *Postgres) Page(ctx context.Context, after string, limit int) ([]Room, error) {
	return p.scan(ctx, "SELECT snapshot,revision FROM setpiece_runtime.rooms WHERE NOT closed AND id>$1 ORDER BY id LIMIT $2", after, bound(limit))
}
func (p *Postgres) Due(ctx context.Context, now time.Time, limit int) ([]Room, error) {
	return p.scan(ctx, "SELECT snapshot,revision FROM setpiece_runtime.rooms WHERE NOT closed AND next_due<=$1 ORDER BY next_due,id LIMIT $2", now, bound(limit))
}
func bound(n int) int {
	if n < 1 || n > 100 {
		return 100
	}
	return n
}
func (p *Postgres) scan(ctx context.Context, sql string, args ...any) ([]Room, error) {
	rows, e := p.pool.Query(ctx, sql, args...)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []Room{}
	for rows.Next() {
		var data []byte
		var rev int64
		if e = rows.Scan(&data, &rev); e != nil {
			return nil, e
		}
		var r Room
		if e = json.Unmarshal(data, &r); e != nil {
			return nil, e
		}
		r.Revision = rev
		out = append(out, r)
	}
	return out, rows.Err()
}

// ReadRoomTx provides the shared room transaction boundary for voting.
// Writers must request a row lock before locking debate/profile rows.
func ReadRoomTx(ctx context.Context, tx pgx.Tx, id string, lock bool) (Room, error) {
	return read(ctx, tx, id, lock)
}

// SaveRoomSnapshotTx writes state/revision inside the caller's locked transaction.
// It does not modify membership or commit; the caller publishes only after commit.
func SaveRoomSnapshotTx(ctx context.Context, tx pgx.Tx, r *Room) error {
	r.Revision++
	data, e := snapshot(*r)
	if e != nil {
		return e
	}
	_, e = tx.Exec(ctx, "UPDATE setpiece_runtime.rooms SET revision=$2,snapshot=$3,next_due=$4,closed=$5 WHERE id=$1", r.ID, r.Revision, data, r.NextDue(), r.Status == "closed")
	return e
}
