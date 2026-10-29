// Package development provisions only the explicitly authorized development project.
package development

import (
	"context"
	_ "embed"
	"errors"
	"github.com/GajapriyanV/SetPiece/backend/internal/ownership"
	"github.com/jackc/pgx/v5/pgxpool"
	"strings"
)

//go:embed permissions.sql
var permissions string

func InstallRole(ctx context.Context, pool *pgxpool.Pool, password string) error {
	if len(password) < 32 || strings.ContainsAny(password, "\x00\r\n") {
		return errors.New("a generated runtime password is required")
	}
	tx, e := pool.Begin(ctx)
	if e != nil {
		return errors.New("development permission connection unavailable")
	}
	defer tx.Rollback(ctx)
	var locked bool
	if e = tx.QueryRow(ctx, "SELECT pg_try_advisory_xact_lock($1)", ownership.LockID).Scan(&locked); e != nil || !locked {
		return errors.New("stop the runtime before permission installation")
	}
	var exists bool
	if e = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='setpiece_app')").Scan(&exists); e != nil || exists {
		return errors.New("runtime role already exists or cannot be inspected; review before changing it")
	}
	if _, e = tx.Exec(ctx, permissions); e != nil {
		return errors.New("development permission installation failed; transaction rolled back")
	}
	// The generated password is quoted as a SQL literal, never logged or returned.
	if _, e = tx.Exec(ctx, "ALTER ROLE setpiece_app PASSWORD '"+strings.ReplaceAll(password, "'", "''")+"'"); e != nil {
		return errors.New("runtime credential installation failed; transaction rolled back")
	}
	if e = tx.Commit(ctx); e != nil {
		return errors.New("development permission commit failed")
	}
	return nil
}
