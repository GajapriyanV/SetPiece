// Package ownership fences durable room writers across process replacement.
package ownership

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const LockID int64 = 7365747069656365

var ErrLost = errors.New("runtime ownership lost; restart required")

type Lease struct {
	conn   *pgxpool.Conn
	token  string
	ctx    context.Context
	cancel context.CancelFunc
	done   chan struct{}
	once   sync.Once
}

// Acquire uses a dedicated session (never transaction pooling). The row update
// waits for old fenced transactions to finish before a successor becomes active.
func Acquire(ctx context.Context, pool *pgxpool.Pool) (*Lease, error) {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return nil, errors.New("ownership database unavailable")
	}
	release := func() {
		closeCtx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = conn.Conn().Close(closeCtx)
		conn.Release()
	}
	var acquired bool
	if err = conn.QueryRow(ctx, "SELECT pg_try_advisory_lock($1)", LockID).Scan(&acquired); err != nil || !acquired {
		release()
		return nil, errors.New("lifecycle database already owned or unavailable")
	}
	tokenBytes := make([]byte, 32)
	if _, err = rand.Read(tokenBytes); err != nil {
		release()
		return nil, errors.New("ownership token unavailable")
	}
	token := hex.EncodeToString(tokenBytes)
	tag, err := conn.Exec(ctx, "UPDATE setpiece_runtime.owner SET token=$1 WHERE singleton", token)
	if err != nil || tag.RowsAffected() != 1 {
		release()
		return nil, errors.New("ownership requires migration 0004 and writable owner row")
	}
	leaseCtx, cancel := context.WithCancel(context.Background())
	l := &Lease{conn: conn, token: token, ctx: leaseCtx, cancel: cancel, done: make(chan struct{})}
	go l.watch()
	return l, nil
}

func (l *Lease) Context() context.Context { return l.ctx }
func (l *Lease) Healthy() bool            { return l.ctx.Err() == nil }

// Check must run BEFORE any domain row lock/write. FOR SHARE is retained until
// commit/rollback and conflicts with the successor's token update. A cached
// token comparison outside the transaction would leave a takeover race.
func (l *Lease) Check(ctx context.Context, tx pgx.Tx) error {
	if !l.Healthy() {
		return ErrLost
	}
	var token string
	if err := tx.QueryRow(ctx, "SELECT token FROM setpiece_runtime.owner WHERE singleton FOR SHARE").Scan(&token); err != nil {
		return err
	}
	if token != l.token {
		l.cancel()
		return ErrLost
	}
	if !l.Healthy() {
		return ErrLost
	}
	return nil
}

func (l *Lease) watch() {
	defer close(l.done)
	ticker := time.NewTicker(250 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-l.ctx.Done():
			return
		case <-ticker.C:
			ctx, cancel := context.WithTimeout(l.ctx, time.Second)
			// Verify the actual lock too, so an accidental unlock fails closed.
			var held bool
			err := l.conn.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM pg_locks
    WHERE locktype='advisory' AND pid=pg_backend_pid() AND granted
    AND classid=($1::bigint >> 32)::oid AND objid=($1::bigint & 4294967295)::oid AND objsubid=1)`, LockID).Scan(&held)
			cancel()
			if err != nil || !held {
				l.cancel()
				return
			}
		}
	}
}

// Idempotent; never returns a session advisory lock to the reusable pool.
func (l *Lease) Close() {
	l.once.Do(func() {
		l.cancel()
		<-l.done
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = l.conn.Conn().Close(ctx)
		l.conn.Release()
	})
}
