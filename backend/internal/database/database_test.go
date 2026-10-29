package database

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

// Opt-in: use only an isolated test database. No application tables are read.
func TestPostgresPoolIntegration(t *testing.T) {
	uri := os.Getenv("SETPIECE_TEST_DATABASE_URL")
	if uri == "" {
		t.Skip("SETPIECE_TEST_DATABASE_URL not configured")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	pool, err := Open(ctx, uri, 2, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err = pool.Ping(ctx); err != nil {
		t.Fatal("test database unavailable")
	}
	var readonly string
	if err = pool.QueryRow(ctx, "SHOW default_transaction_read_only").Scan(&readonly); err != nil {
		t.Fatal(err)
	}
	if readonly != "on" {
		t.Fatal("pool must default to read-only")
	}
	var one int
	if err = pool.QueryRow(ctx, "SELECT 1").Scan(&one); err != nil || one != 1 {
		t.Fatal("read query failed")
	}
	_, err = pool.Exec(ctx, "CREATE TABLE should_never_be_created(id integer)")
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "25006" {
		t.Fatal("expected read-only transaction rejection")
	}
	queryCtx, stopQuery := context.WithTimeout(ctx, 50*time.Millisecond)
	defer stopQuery()
	start := time.Now()
	_, err = pool.Exec(queryCtx, "SELECT pg_sleep(5)")
	if !errors.Is(err, context.DeadlineExceeded) || time.Since(start) > time.Second {
		t.Fatal("query did not respect the caller deadline")
	}
	if err = pool.Ping(ctx); err != nil {
		t.Fatal("pool did not recover after query cancellation")
	}
}

func TestInvalidConnectionDoesNotLeak(t *testing.T) {
	_, err := Open(context.Background(), "postgres://secret:%ZZ@localhost/test", 2, time.Second)
	if err == nil {
		t.Fatal("expected invalid configuration")
	}
	if err.Error() != "invalid database connection configuration" {
		t.Fatal("unsafe parse error")
	}
}
