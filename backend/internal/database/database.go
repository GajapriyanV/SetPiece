package database

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Open constructs a bounded pool. Connectivity is reported by /ready; a
// temporary outage must not prevent liveness or cause credentials to be logged.
func Open(ctx context.Context, connectionURI string, maxConns int32, queryTimeout time.Duration) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(connectionURI)
	if err != nil {
		return nil, errors.New("invalid database connection configuration")
	}
	cfg.MaxConns = maxConns
	cfg.MinConns = 0
	cfg.MaxConnLifetime = 30 * time.Minute
	cfg.MaxConnIdleTime = 5 * time.Minute
	cfg.HealthCheckPeriod = 30 * time.Second
	cfg.ConnConfig.ConnectTimeout = queryTimeout
	// All connections in this first, read-only milestone reject writes.
	cfg.ConnConfig.RuntimeParams["default_transaction_read_only"] = "on"
	cfg.ConnConfig.RuntimeParams["statement_timeout"] = "3000"
	cfg.ConnConfig.RuntimeParams["application_name"] = "setpiece-profile-read"
	cfg.ConnConfig.RuntimeParams["timezone"] = "UTC"
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, errors.New("could not initialize database pool")
	}
	return pool, nil
}
