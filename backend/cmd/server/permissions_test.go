package main

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Called only after TestIntegratedRehearsal's empty loopback fixture guard.
func rehearsePermissions(t *testing.T, ctx context.Context, pool *pgxpool.Pool, user string) {
	t.Helper()
	exec := func(sql string) {
		t.Helper()
		if _, e := pool.Exec(ctx, sql); e != nil {
			t.Fatal(e)
		}
	}
	exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;
 GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO anon,authenticated;
 GRANT UPDATE(is_admin,elo),INSERT(is_admin) ON public.profiles TO authenticated;
 CREATE POLICY fixture_owner_write ON public.profiles FOR UPDATE TO authenticated USING(id=auth.uid()) WITH CHECK(id=auth.uid());`)
	asRole := func(role, sql string, wantDenied bool) {
		t.Helper()
		tx, e := pool.Begin(ctx)
		if e != nil {
			t.Fatal(e)
		}
		defer tx.Rollback(ctx)
		if _, e = tx.Exec(ctx, "SET LOCAL ROLE "+pgx.Identifier{role}.Sanitize()); e != nil {
			t.Fatal(e)
		}
		if _, e = tx.Exec(ctx, "SELECT set_config('request.jwt.claim.sub',$1,true)", user); e != nil {
			t.Fatal(e)
		}
		_, e = tx.Exec(ctx, sql)
		if wantDenied {
			if e == nil {
				t.Fatal("bypass allowed for", role, sql)
			}
			if pg, ok := e.(interface{ SQLState() string }); !ok || pg.SQLState() != "42501" {
				t.Fatal("expected privilege rejection, got", e)
			}
		} else if e != nil {
			t.Fatal(e)
		}
	}
	// Demonstrate the inspected owner-row policy does permit protected columns.
	asRole("authenticated", "UPDATE public.profiles SET is_admin=true,elo=9999 WHERE id='"+user+"'", false)
	sql, e := os.ReadFile(filepath.Join("..", "..", "security", "local-cutover.sql"))
	if e != nil {
		t.Fatal(e)
	}
	exec(string(sql))
	for _, role := range []string{"anon", "authenticated"} {
		var bypass bool
		e = pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND
   (has_table_privilege($1,format('%I.%I',schemaname,tablename),'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_any_column_privilege($1,format('%I.%I',schemaname,tablename),'INSERT,UPDATE,REFERENCES')))`, role).Scan(&bypass)
		if e != nil || bypass {
			t.Fatal("effective browser mutation privilege remains", role, e)
		}

		for _, statement := range []string{
			"UPDATE public.profiles SET is_admin=true,elo=9999 WHERE id='" + user + "'",
			"INSERT INTO public.contact_tickets(name,email,subject,message) VALUES('x','x','x','x')",
			"INSERT INTO public.forum_threads(author_id,title,body,flair) VALUES('" + user + "','x','x','General')",
			"UPDATE public.notifications SET is_read=true",
			"SELECT public.close_thread_if_expired('00000000-0000-4000-8000-000000000001')",
		} {
			asRole(role, statement, true)
		}
		asRole(role, "SELECT username FROM public.profiles", false)
	}
	for _, statement := range []string{
		"UPDATE public.profiles SET is_admin=true WHERE id='" + user + "'",
		"DELETE FROM public.profiles WHERE id='" + user + "'",
		"TRUNCATE public.profiles CASCADE",
		"CREATE TABLE public.unexpected(id int)",
		"SELECT public.close_thread_if_expired('00000000-0000-4000-8000-000000000001')",
		"UPDATE auth.users SET email='unexpected'",
		"SELECT * FROM setpiece_migrations.applied",
	} {
		asRole("setpiece_app", statement, true)
	}
	t.Log("protected-field bypass reproduced then rejected; browser writes/RPC and runtime DDL/admin/Auth/ledger access denied")
}
