// Package migrations applies reviewed SQL only through the explicit rehearsal command.
package migrations

import (
	"context"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed *.sql
var source embed.FS
var names = []string{"0001_room_lifecycle.sql", "0002_debate_results.sql", "0003_forum_closures.sql", "0004_runtime_ownership.sql"}

// Apply is atomic, checksum-checked and excluded by the running lifecycle lease.
// The command validates the disposable URI before constructing this pool.
func Apply(ctx context.Context, pool *pgxpool.Pool) error {
	tx, e := pool.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	var acquired bool
	if e = tx.QueryRow(ctx, "SELECT pg_try_advisory_xact_lock(7365747069656365)").Scan(&acquired); e != nil {
		return e
	}
	if !acquired {
		return errors.New("stop the owning Go runtime before applying migrations")
	}
	// If a dead owner still has an in-flight writer, wait for its transaction,
	// then invalidate its token before applying DDL. A fresh runtime must claim it.
	var fenced bool
	if e = tx.QueryRow(ctx, "SELECT to_regclass('setpiece_runtime.owner') IS NOT NULL").Scan(&fenced); e != nil {
		return e
	}
	if fenced {
		if _, e = tx.Exec(ctx, "UPDATE setpiece_runtime.owner SET token='migration' WHERE singleton"); e != nil {
			return e
		}
	}
	if _, e = tx.Exec(ctx, `CREATE SCHEMA IF NOT EXISTS setpiece_migrations;
 REVOKE ALL ON SCHEMA setpiece_migrations FROM PUBLIC;
 CREATE TABLE IF NOT EXISTS setpiece_migrations.applied(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now());
 ALTER TABLE setpiece_migrations.applied ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON setpiece_migrations.applied FROM PUBLIC`); e != nil {
		return e
	}
	for _, name := range names {
		sql, e := source.ReadFile(name)
		if e != nil {
			return e
		}
		sql = []byte(strings.ReplaceAll(string(sql), "\r\n", "\n"))
		sum := sha256.Sum256(sql)
		checksum := hex.EncodeToString(sum[:])
		var existing string
		e = tx.QueryRow(ctx, "SELECT checksum FROM setpiece_migrations.applied WHERE name=$1", name).Scan(&existing)
		if e == nil {
			if existing != checksum {
				return fmt.Errorf("migration checksum mismatch: %s", name)
			}
			continue
		}
		if !errors.Is(e, pgx.ErrNoRows) {
			return e
		}
		// SQL files include transaction wrappers for manual application; this runner
		// owns one enclosing transaction for the entire ordered migration set.
		lines := strings.Split(string(sql), "\n")
		body := []string{}
		for _, line := range lines {
			v := strings.TrimSpace(line)
			if v != "BEGIN;" && v != "COMMIT;" {
				body = append(body, line)
			}
		}
		if _, e = tx.Exec(ctx, strings.Join(body, "\n")); e != nil {
			return fmt.Errorf("migration %s failed; transaction rolled back", name)
		}
		if _, e = tx.Exec(ctx, "INSERT INTO setpiece_migrations.applied(name,checksum) VALUES($1,$2)", name, checksum); e != nil {
			return e
		}
	}
	return tx.Commit(ctx)
}
