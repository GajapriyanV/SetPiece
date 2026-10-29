package ownership

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/GajapriyanV/SetPiece/backend/internal/config"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestOwnershipFencing(t *testing.T) {
	uri := os.Getenv("SETPIECE_OWNERSHIP_TEST_DATABASE_URL")
	if uri == "" {
		t.Skip("requires a NEW EMPTY local ownership fixture")
	}
	if config.ValidateRehearsalDatabaseURI(uri) != nil || !strings.Contains(uri, "/setpiece_m5_test_") {
		t.Fatal("invalid fixture URI")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, uri)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	var count int
	if err = pool.QueryRow(ctx, "SELECT count(*) FROM pg_tables WHERE schemaname IN ('public','setpiece_runtime')").Scan(&count); err != nil || count != 0 {
		t.Fatal("requires empty fixture")
	}
	if _, err = pool.Exec(ctx, "CREATE SCHEMA setpiece_runtime"); err != nil {
		t.Fatal(err)
	}
	sql, err := os.ReadFile(filepath.Join("..", "..", "migrations", "0004_runtime_ownership.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, string(sql)); err != nil {
		t.Fatal(err)
	}
	first, err := Acquire(ctx, pool)
	if err != nil {
		t.Fatal(err)
	}
	defer first.Close()
	if second, err := Acquire(ctx, pool); err == nil {
		second.Close()
		t.Fatal("concurrent owner accepted")
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(context.Background())
	if err = first.Check(ctx, tx); err != nil {
		t.Fatal(err)
	}
	// Terminate only the dedicated lease session; an already fenced writer keeps
	// its row lock, so a replacement cannot publish its ownership until it ends.
	if _, err = pool.Exec(ctx, "SELECT pg_terminate_backend($1)", first.conn.Conn().PgConn().PID()); err != nil {
		t.Fatal(err)
	}
	select {
	case <-first.Context().Done():
	case <-time.After(3 * time.Second):
		t.Fatal("lease loss not detected")
	}
	pending := make(chan *Lease, 1)
	failures := make(chan error, 1)
	go func() {
		next, e := Acquire(ctx, pool)
		if e != nil {
			failures <- e
			return
		}
		pending <- next
	}()
	select {
	case l := <-pending:
		l.Close()
		t.Fatal("takeover passed in-flight writer")
	case e := <-failures:
		t.Fatal(e)
	case <-time.After(150 * time.Millisecond):
	}
	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	var next *Lease
	select {
	case next = <-pending:
	case e := <-failures:
		t.Fatal(e)
	case <-time.After(3 * time.Second):
		t.Fatal("takeover blocked")
	}
	defer next.Close()
	staleCtx, staleCancel := context.WithCancel(context.Background())
	defer staleCancel()
	// Model a partitioned old process whose heartbeat has not noticed loss yet.
	stale := &Lease{token: first.token, ctx: staleCtx, cancel: staleCancel}
	tx, err = pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(context.Background())
	if e := stale.Check(ctx, tx); !errors.Is(e, ErrLost) {
		t.Fatalf("stale token allowed: %v", e)
	}
	tx.Rollback(ctx)
	tx, err = pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(context.Background())
	if err = next.Check(ctx, tx); err != nil {
		t.Fatal("replacement cannot write", err)
	}
	tx.Rollback(ctx)
	first.Close()
	first.Close()
	if !next.Healthy() {
		t.Fatal("old cleanup cancelled replacement")
	}
	t.Log("terminated lease, serialized takeover, stale-token rejection and independent replacement passed")
}
