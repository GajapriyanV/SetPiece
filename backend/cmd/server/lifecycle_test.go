package main

import (
	"context"
	"io"
	"log/slog"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/GajapriyanV/SetPiece/backend/internal/config"
	"github.com/GajapriyanV/SetPiece/backend/internal/debates"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestIsolatedLifecycleStartup(t *testing.T) {
	uri := os.Getenv("SETPIECE_LIFECYCLE_SERVER_TEST_DATABASE_URL")
	if uri == "" {
		t.Skip("isolated pre-migrated lifecycle DB not configured")
	}
	_, e := config.Load(func(k string) string {
		if k == "SUPABASE_URL" {
			return "https://project.supabase.co"
		}
		if k == "LIFECYCLE_DATABASE_URL" {
			return uri
		}
		return ""
	})
	if e != nil || !strings.Contains(uri, "/setpiece_m2_test_") {
		t.Fatal("requires disposable lifecycle DB")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	service, cleanup, e := startLifecycle(ctx, uri, logger)
	if e != nil {
		t.Fatal(e)
	}
	defer func() {
		if cleanup != nil {
			cleanup()
		}
	}()
	if _, second, e := startLifecycle(ctx, uri, logger); e == nil {
		second()
		t.Fatal("second runtime obtained same database")
	}
	pool, e := pgxpool.New(ctx, uri)
	if e != nil {
		t.Fatal(e)
	}
	defer pool.Close()
	empty, e := service.Create(ctx, "00000000-0000-4000-8000-000000000001", []debates.Topic{{Topic: "Scheduler fixture", SideA: "A", SideB: "B"}}, false)
	if e != nil {
		t.Fatal(e)
	}
	// Set a deadline on a genuinely empty room and observe the running worker.
	_, e = pool.Exec(ctx, `UPDATE setpiece_runtime.rooms SET
 snapshot=jsonb_set(snapshot,'{emptyAt}',to_jsonb((now()-interval '1 minute')::timestamptz)),
 next_due=now()-interval '1 minute' WHERE id=$1`, empty.ID)
	if e != nil {
		t.Fatal(e)
	}
	poll := time.NewTicker(20 * time.Millisecond)
	defer poll.Stop()
	timeout := time.NewTimer(3 * time.Second)
	defer timeout.Stop()
	observed := false
	for !observed {
		select {
		case <-timeout.C:
			t.Fatal("scheduler did not close overdue empty room")
		case <-poll.C:
			state, err := service.State(ctx, empty.ID, empty.Creator)
			if err != nil {
				t.Fatal(err)
			}
			observed = state.Status == "closed"
		}
	}
	cleanup()
	cleanup = nil
	_, again, e := startLifecycle(ctx, uri, logger)
	if e != nil {
		t.Fatal("lease did not release", e)
	}
	again()
}
