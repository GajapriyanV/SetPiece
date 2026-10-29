// developdb upgrades the named existing development project after a verified backup.
package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"github.com/GajapriyanV/SetPiece/backend/internal/config"
	"github.com/GajapriyanV/SetPiece/backend/internal/development"
	"github.com/GajapriyanV/SetPiece/backend/migrations"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"path/filepath"
	"time"
)

type backupManifest struct {
	Project  string `json:"project_ref"`
	File     string `json:"file"`
	Hash     string `json:"sha256"`
	Restored bool   `json:"restore_verified"`
}

func verifyBackup(name, project string) error {
	invalid := errors.New("a matching backup manifest with verified archive hash and local restore is required")
	data, e := os.ReadFile(name)
	if e != nil {
		return invalid
	}
	var b backupManifest
	if json.Unmarshal(data, &b) != nil || b.Project != project || !b.Restored || b.File != "before.dump" {
		return invalid
	}
	data, e = os.ReadFile(filepath.Join(filepath.Dir(name), b.File))
	if e != nil || len(data) == 0 {
		return invalid
	}
	sum := sha256.Sum256(data)
	if hex.EncodeToString(sum[:]) != b.Hash {
		return invalid
	}
	return nil
}
func run(file, project, backup string, apply bool) error {
	if file == "" || project == "" {
		return errors.New("explicit environment file and development project are required")
	}
	if e := config.LoadEnvFile(file); e != nil {
		return errors.New("could not load development admin configuration")
	}
	if os.Getenv("APP_ENV") != "development" {
		return errors.New("development mode is required")
	}
	uri := os.Getenv("DATABASE_URL")
	if e := config.ValidateDevelopmentDatabaseURI(uri, os.Getenv("SUPABASE_URL"), project, "postgres"); e != nil {
		return e
	}
	if e := verifyBackup(backup, project); e != nil {
		return e
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	pc, e := pgxpool.ParseConfig(uri)
	if e != nil {
		return errors.New("invalid development admin connection")
	}
	pc.MaxConns = 2
	pc.ConnConfig.ConnectTimeout = 10 * time.Second
	pc.ConnConfig.RuntimeParams["lock_timeout"] = "5000"
	pc.ConnConfig.RuntimeParams["statement_timeout"] = "30000"
	pc.ConnConfig.RuntimeParams["application_name"] = "setpiece-development-migration"
	pool, e := pgxpool.NewWithConfig(ctx, pc)
	if e != nil {
		return errors.New("development admin pool unavailable")
	}
	defer pool.Close()
	var invalid int
	e = pool.QueryRow(ctx, `SELECT
 (SELECT count(*) FROM public.forum_replies r LEFT JOIN public.forum_replies p ON p.id=r.parent_reply_id WHERE r.parent_reply_id IS NOT NULL AND (p.id IS NULL OR p.thread_id<>r.thread_id))+
 (SELECT count(*) FROM (SELECT thread_id FROM public.forum_replies WHERE is_mvp GROUP BY thread_id HAVING count(*)>1) m)+
 (SELECT count(*) FROM public.debates WHERE status IN ('live','voting'))`).Scan(&invalid)
	if e != nil || invalid != 0 {
		return errors.New("development preflight failed: inspect reply links, MVPs and active debates")
	}
	if !apply {
		fmt.Println("Development backup and migration preflight passed; no changes applied")
		return nil
	}
	if len(os.Getenv("DEVELOPMENT_RUNTIME_PASSWORD")) < 32 {
		return errors.New("generated runtime password is required before applying")
	}
	if e = migrations.Apply(ctx, pool); e != nil {
		return errors.New("development migrations failed; review schema and ledger before retry")
	}
	if e = development.InstallRole(ctx, pool, os.Getenv("DEVELOPMENT_RUNTIME_PASSWORD")); e != nil {
		return e
	}
	fmt.Println("Development migrations and restricted runtime permissions applied")
	return nil
}
func main() {
	file := flag.String("env-file", "", "explicit ignored admin environment file")
	project := flag.String("project", "", "confirmed development Supabase project reference")
	backup := flag.String("backup-manifest", "", "verified local backup manifest")
	apply := flag.Bool("apply", false, "apply reviewed development changes")
	flag.Parse()
	if e := run(*file, *project, *backup, *apply); e != nil {
		fmt.Fprintln(os.Stderr, e)
		os.Exit(1)
	}
}
