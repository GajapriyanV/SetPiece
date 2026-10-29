package main

import (
	"context"
	"flag"
	"fmt"
	"github.com/GajapriyanV/SetPiece/backend/internal/config"
	"github.com/GajapriyanV/SetPiece/backend/migrations"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"time"
)

func main() {
	file := flag.String("env-file", "", "explicit local rehearsal environment file (no default)")
	flag.Parse()
	if e := run(*file); e != nil {
		fmt.Fprintln(os.Stderr, e)
		os.Exit(1)
	}
	fmt.Println("Rehearsal migrations verified and applied")
}
func run(file string) error {
	if e := config.LoadEnvFile(file); e != nil {
		return e
	}
	c, e := config.Load(os.Getenv)
	if e != nil {
		return e
	}
	if c.RehearsalDatabaseURL == "" {
		return fmt.Errorf("migration command requires REHEARSAL_DATABASE_URL; production is not supported")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pc, e := pgxpool.ParseConfig(c.RehearsalDatabaseURL)
	if e != nil {
		return fmt.Errorf("invalid rehearsal configuration")
	}
	pc.MaxConns = 2
	pc.ConnConfig.ConnectTimeout = 3 * time.Second
	pc.ConnConfig.RuntimeParams["lock_timeout"] = "2000"
	pool, e := pgxpool.NewWithConfig(ctx, pc)
	if e != nil {
		return fmt.Errorf("rehearsal database unavailable")
	}
	defer pool.Close()
	return migrations.Apply(ctx, pool)
}
