package leaderboard

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5/pgxpool"
	"net/url"
	"strconv"
)

var ErrInvalid = errors.New("invalid leaderboard parameters")
var ErrNotFound = errors.New("profile not found")

type Filter struct {
	Type, Section, Period string
	Page                  int
}

func Parse(v url.Values) (Filter, error) {
	f := Filter{Type: v.Get("type"), Section: v.Get("section"), Period: v.Get("period"), Page: 1}
	if f.Type == "" {
		f.Type = "unranked"
	}
	if f.Section == "" {
		f.Section = "global"
	}
	if f.Period == "" {
		f.Period = "alltime"
	}
	if v.Get("page") != "" {
		n, e := strconv.Atoi(v.Get("page"))
		if e != nil {
			return f, ErrInvalid
		}
		f.Page = n
	}
	if (f.Type != "ranked" && f.Type != "unranked") || (f.Section != "global" && f.Section != "regional") || (f.Period != "alltime" && f.Period != "season") || f.Page < 1 || f.Page > 100000 {
		return f, ErrInvalid
	}
	return f, nil
}

// Ordering is shared by the list, personal rank and canonical profile.
// Existing season null-date ordering is retained; all-time null dates sort last.
func Order(f Filter) string {
	order := "wins DESC, losses ASC, debates_count DESC"
	if f.Period == "season" {
		order = "wins DESC, win_pct DESC, debates_count DESC"
	}
	if f.Type == "ranked" {
		order = "elo DESC, debates_count DESC"
	}
	nulls := "LAST"
	if f.Period == "season" {
		nulls = "FIRST"
	}
	return order + ", created_at ASC NULLS " + nulls + ", id ASC"
}
func CTE(f Filter) string {
	source := `SELECT id,username,country,avatar_url,created_at,elo,wins,losses,draws,debates_count FROM public.profiles`
	if f.Period == "season" {
		source = `
 SELECT p.id,p.username,p.country,p.avatar_url,p.created_at,p.elo,
 coalesce(s.wins,0) wins,coalesce(s.losses,0) losses,coalesce(s.draws,0) draws,
 coalesce(s.wins+s.losses+s.draws,0) debates_count
 FROM public.profiles p LEFT JOIN (
 SELECT participant id,
 count(*) FILTER(WHERE result IS DISTINCT FROM 'draw' AND winner_id=participant) wins,
 count(*) FILTER(WHERE result IS DISTINCT FROM 'draw' AND winner_id IS NOT NULL AND winner_id<>participant) losses,
 count(*) FILTER(WHERE result='draw') draws
 FROM public.debates d CROSS JOIN LATERAL (VALUES (d.debater_a_id), (CASE WHEN d.debater_b_id IS DISTINCT FROM d.debater_a_id THEN d.debater_b_id END)) members(participant)
 WHERE status='finished' AND finished_at >= '2026-01-01T00:00:00Z'::timestamptz
 AND participant IS NOT NULL AND (result='draw' OR winner_id IN (debater_a_id,debater_b_id))
 GROUP BY participant
 ) s ON s.id=p.id`
	}
	return `WITH source AS (` + source + `), stats AS (
 SELECT *,CASE WHEN wins+losses+draws>0 THEN round(wins::numeric*100/(wins+losses+draws))::int ELSE 0 END win_pct
 FROM source), ranked AS (
 SELECT *,row_number() OVER(ORDER BY ` + Order(f) + `) rank FROM stats
 WHERE ($1::text='global' OR country=(SELECT country FROM public.profiles WHERE id=$2::uuid))
 ) `
}

type Repository struct{ Pool *pgxpool.Pool }

func (r *Repository) List(ctx context.Context, f Filter, userID string) (json.RawMessage, error) {
	var body []byte
	var uid any
	if userID != "" {
		uid = userID
	}
	err := r.Pool.QueryRow(ctx, CTE(f)+`SELECT jsonb_build_object(
 'players',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'username',username,'country',country,
 'wins',wins,'losses',losses,'draws',draws,'debates_count',debates_count,'elo',elo,'winPct',win_pct,'avatarUrl',avatar_url) ORDER BY rank)
 FROM (SELECT * FROM ranked ORDER BY rank LIMIT 20 OFFSET $3) page),'[]'::jsonb),
 'total',(SELECT count(*) FROM ranked),'page',$4::int,
 'userCountry',CASE WHEN $1='regional' THEN (SELECT country FROM public.profiles WHERE id=$2::uuid) ELSE NULL END)`,
		f.Section, uid, (f.Page-1)*20, f.Page).Scan(&body)
	return body, err
}
func (r *Repository) Me(ctx context.Context, f Filter, userID string) (json.RawMessage, error) {
	var body []byte
	err := r.Pool.QueryRow(ctx, CTE(f)+`SELECT jsonb_build_object('userId',s.id,
 'rank',(SELECT rank FROM ranked WHERE id=s.id),'wins',s.wins,'losses',s.losses,'draws',s.draws,
 'elo',s.elo,'winPct',s.win_pct,'debates_count',s.debates_count)
 FROM stats s WHERE s.id=$2::uuid`, f.Section, userID).Scan(&body)
	return body, err
}
