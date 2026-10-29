package leaderboard

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// The pre-4C expansion sorted/deduplicated two participants separately for each debate.
// Keep this reference here to reproduce the measured comparison, not as a runtime fallback.
const oldParticipants = "CROSS JOIN LATERAL (SELECT DISTINCT unnest(ARRAY[d.debater_a_id,d.debater_b_id]) participant) members"
const valuesParticipants = "CROSS JOIN LATERAL (VALUES (d.debater_a_id), (CASE WHEN d.debater_b_id IS DISTINCT FROM d.debater_a_id THEN d.debater_b_id END)) members(participant)"

type queryCapture struct {
	sql   string
	args  []any
	calls int
}

func (q *queryCapture) TraceQueryStart(ctx context.Context, _ *pgx.Conn, d pgx.TraceQueryStartData) context.Context {
	q.sql = d.SQL
	q.args = append([]any(nil), d.Args...)
	q.calls++
	return ctx
}
func (*queryCapture) TraceQueryEnd(context.Context, *pgx.Conn, pgx.TraceQueryEndData) {}

func TestLeaderboardPerformance(t *testing.T) {
	uri := os.Getenv("SETPIECE_PERFORMANCE_TEST_DATABASE_URL")
	if uri == "" {
		t.Skip("configure a NEW EMPTY disposable performance database")
	}
	u, e := url.Parse(uri)
	if e != nil || (u.Scheme != "postgres" && u.Scheme != "postgresql") || u.Hostname() != "127.0.0.1" || !strings.HasPrefix(strings.TrimPrefix(u.Path, "/"), "setpiece_m4_perf_") || len(u.Query()) != 1 || u.Query().Get("sslmode") != "disable" {
		t.Fatal("requires loopback setpiece_m4_perf_* with sslmode=disable")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	cfg, e := pgxpool.ParseConfig(uri)
	if e != nil {
		t.Fatal("invalid test configuration")
	}
	capture := &queryCapture{}
	cfg.ConnConfig.Tracer = capture
	cfg.MaxConns = 1
	pool, e := pgxpool.NewWithConfig(ctx, cfg)
	if e != nil {
		t.Fatal("cannot open test database")
	}
	defer pool.Close()
	var exists bool
	if e = pool.QueryRow(ctx, "SELECT to_regclass('public.profiles') IS NOT NULL OR to_regnamespace('auth') IS NOT NULL").Scan(&exists); e != nil || exists {
		t.Fatal("requires NEW EMPTY fixture database")
	}
	exec := func(sql string) {
		t.Helper()
		if _, e := pool.Exec(ctx, sql); e != nil {
			t.Fatal(e)
		}
	}
	fixture, e := os.ReadFile("../users/testdata/schema.sql")
	if e != nil {
		t.Fatal(e)
	}
	exec(string(fixture))
	var version, workmem string
	if e = pool.QueryRow(ctx, "SELECT current_setting('server_version'),current_setting('work_mem')").Scan(&version, &workmem); e != nil {
		t.Fatal(e)
	}
	t.Logf("PostgreSQL %s; work_mem=%s; one connection; loopback synthetic data; 7 interleaved warm samples", version, workmem)
	runJSON := func(sql string, args []any) []byte {
		t.Helper()
		var b []byte
		if e := pool.QueryRow(ctx, sql, args...).Scan(&b); e != nil {
			t.Fatal(e)
		}
		return b
	}
	for _, size := range []int{1000, 10000} {
		exec("TRUNCATE public.votes,public.debates,public.profiles,auth.users CASCADE")
		exec(fmt.Sprintf("INSERT INTO auth.users(id) SELECT md5(n::text)::uuid FROM generate_series(1,%d) n", size))
		exec(fmt.Sprintf("INSERT INTO public.profiles(id,username,country,created_at,wins,losses,draws,debates_count,elo) SELECT md5(n::text)::uuid,'fixture_'||n,CASE WHEN n%%7=0 THEN NULL WHEN n%%3=0 THEN 'Canada' ELSE 'France' END,CASE WHEN n%%13=0 THEN NULL ELSE '2020-01-01'::timestamptz END,n%%100,n%%30,n%%7,n%%150,1000+n%%500 FROM generate_series(1,%d) n", size))
		// Include null/deleted participants, duplicate participants, draws, invalid winners,
		// unfinished and pre-season records to compare semantics beyond the happy path.
		exec(fmt.Sprintf(`INSERT INTO public.debates(room_code,topic,side_a_label,side_b_label,debater_a_id,debater_b_id,winner_id,result,status,finished_at)
 SELECT 'fixture','fixture','A','B',
 CASE WHEN n%%19=0 THEN NULL ELSE md5((n%%%d+1)::text)::uuid END,
 CASE WHEN n%%23=0 THEN NULL WHEN n%%17=0 THEN md5((n%%%d+1)::text)::uuid ELSE md5(((n+1)%%%d+1)::text)::uuid END,
 md5((CASE WHEN n%%29=0 THEN (n+2)%%%d+1 ELSE n%%%d+1 END)::text)::uuid,
 CASE WHEN n%%5=0 THEN 'draw' ELSE 'side_a' END,
 CASE WHEN n%%31=0 THEN 'live' ELSE 'finished' END,
 CASE WHEN n%%37=0 THEN '2025-12-01'::timestamptz ELSE '2026-02-01'::timestamptz END
 FROM generate_series(1,%d) n`, size, size, size, size, size, size*10))
		exec("ANALYZE public.profiles")
		exec("ANALYZE public.debates")
		repo := &Repository{Pool: pool}
		// 8 combinations plus list/personal queries retain one SQL round trip each.
		for _, period := range []string{"alltime", "season"} {
			for _, kind := range []string{"unranked", "ranked"} {
				for _, section := range []string{"global", "regional"} {
					for _, operation := range []string{"list", "me"} {
						f := Filter{Type: kind, Section: section, Period: period, Page: 2}
						user := "eccbc87e-4b5c-e2fe-2830-8fd9f2a7baf3" // md5("3"), Canada
						capture.calls = 0
						if operation == "list" {
							_, e = repo.List(ctx, f, user)
						} else {
							_, e = repo.Me(ctx, f, user)
						}
						if e != nil {
							t.Fatal(e)
						}
						if capture.calls != 1 {
							t.Fatalf("%s used %d queries", operation, capture.calls)
						}
						sql, args := capture.sql, append([]any(nil), capture.args...)
						before := strings.ReplaceAll(sql, valuesParticipants, oldParticipants)
						after := strings.ReplaceAll(sql, oldParticipants, valuesParticipants)
						var want, got any
						if e = json.Unmarshal(runJSON(before, args), &want); e != nil {
							t.Fatal(e)
						}
						if e = json.Unmarshal(runJSON(after, args), &got); e != nil {
							t.Fatal(e)
						}
						if !reflect.DeepEqual(want, got) {
							t.Fatalf("participant expansion changed %d/%s/%s/%s/%s", size, period, kind, section, operation)
						}
						// Measure representative list and personal paths; other combinations above verify parity.
						if kind != "unranked" || section != "global" {
							continue
						}
						times := func() ([]float64, []float64) {
							a, b := []float64{}, []float64{}
							for i := 0; i < 7; i++ {
								pair := []string{before, after}
								if i%2 == 1 {
									pair = []string{after, before}
								}
								for j, q := range pair {
									start := time.Now()
									runJSON(q, args)
									ms := float64(time.Since(start).Microseconds()) / 1000
									if (i%2 == 0 && j == 0) || (i%2 == 1 && j == 1) {
										a = append(a, ms)
									} else {
										b = append(b, ms)
									}
								}
							}
							sort.Float64s(a)
							sort.Float64s(b)
							return a, b
						}
						a, b := times()
						t.Logf("profiles=%d debates=%d %s/%s queries=1 median_ms before=%.3f after=%.3f max_ms before=%.3f after=%.3f", size, size*10, period, operation, a[3], b[3], a[6], b[6])
						if period == "season" {
							for label, q := range map[string]string{"before": before, "after": after} {
								var raw []byte
								if e = pool.QueryRow(ctx, "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) "+q, args...).Scan(&raw); e != nil {
									t.Fatal(e)
								}
								var plans []map[string]any
								if e = json.Unmarshal(raw, &plans); e != nil {
									t.Fatal(e)
								}
								p := plans[0]
								plan := p["Plan"].(map[string]any)
								t.Logf("plan %s %d/%s execution_ms=%v shared_hit_blocks=%v temp_written_blocks=%v", label, size, operation, p["Execution Time"], plan["Shared Hit Blocks"], plan["Temp Written Blocks"])
							}
						}
					}
				}
			}
		}
	}
}
