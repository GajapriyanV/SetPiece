package main

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/GajapriyanV/SetPiece/backend/internal/debates"
	"github.com/GajapriyanV/SetPiece/backend/internal/livekit"
	"github.com/GajapriyanV/SetPiece/backend/internal/ownership"
	"github.com/GajapriyanV/SetPiece/backend/internal/realtime"
	"github.com/GajapriyanV/SetPiece/backend/internal/voting"
	"github.com/jackc/pgx/v5/pgxpool"
)

type lifecycleRuntime struct {
	Owner     *ownership.Lease
	Directory *debates.Postgres
	*debates.Service
	Voting     *voting.Service
	MediaStore *livekit.PostgresStore
	Snapshots  *realtime.PostgresSource
}

// Called only for isolated lifecycle fixtures; unified development projects share the application pool.
func startLifecycle(ctx context.Context, uri string, logger *slog.Logger) (*lifecycleRuntime, func(), error) {
	cfg, e := pgxpool.ParseConfig(uri)
	if e != nil {
		return nil, nil, errors.New("invalid lifecycle database configuration")
	}
	cfg.MaxConns = 6
	cfg.ConnConfig.ConnectTimeout = 3 * time.Second
	cfg.ConnConfig.RuntimeParams["statement_timeout"] = "3000"
	cfg.ConnConfig.RuntimeParams["lock_timeout"] = "2000"
	cfg.ConnConfig.RuntimeParams["timezone"] = "UTC"
	pool, e := pgxpool.NewWithConfig(ctx, cfg)
	if e != nil {
		return nil, nil, errors.New("lifecycle database unavailable")
	}
	runtime, cleanup, e := startLifecyclePool(ctx, pool, logger)
	if e != nil {
		pool.Close()
		return nil, nil, e
	}
	return runtime, func() { cleanup(); pool.Close() }, nil
}

// The caller owns this pool; rehearsal shares it with every application module.
func startLifecyclePool(ctx context.Context, pool *pgxpool.Pool, logger *slog.Logger) (*lifecycleRuntime, func(), error) {
	owner, e := ownership.Acquire(ctx, pool)
	if e != nil {
		return nil, nil, e
	}
	fail := owner.Close
	var migrated bool
	if e = pool.QueryRow(ctx, "SELECT to_regclass('setpiece_runtime.results') IS NOT NULL").Scan(&migrated); e != nil || !migrated {
		fail()
		return nil, nil, errors.New("lifecycle requires migrations 0001 and 0002 in the isolated database")
	}
	service := debates.NewService(debates.NewPostgresOwned(pool, owner), time.Now, 15*time.Second)
	if e = service.Recover(ctx); e != nil {
		fail()
		return nil, nil, errors.New("lifecycle recovery failed; verify isolated schema migration")
	}
	workerCtx, cancel := context.WithCancel(owner.Context())
	done := make(chan struct{})
	ticker := time.NewTicker(250 * time.Millisecond)
	go func() {
		defer close(done)
		service.Run(workerCtx, ticker.C, func(error) { logger.Warn("lifecycle scheduler failed") })
	}()
	votes := voting.NewServiceOwned(pool, owner)
	voteTicks := time.NewTicker(250 * time.Millisecond)
	voteDone := make(chan struct{})
	go func() {
		defer close(voteDone)
		votes.Run(workerCtx, voteTicks.C, func(error) { logger.Warn("vote finalization failed") })
	}()
	var once sync.Once
	cleanup := func() {
		once.Do(func() {
			cancel()
			ticker.Stop()
			voteTicks.Stop()
			<-done
			<-voteDone
			fail()
		})
	}
	return &lifecycleRuntime{Owner: owner, Service: service, Voting: votes, Snapshots: realtime.NewPostgresSource(pool), MediaStore: livekit.NewStore(pool), Directory: debates.NewPostgres(pool)}, cleanup, nil
}
