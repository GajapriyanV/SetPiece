package users

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresRepository struct {
	pool      *pgxpool.Pool
	canonical bool
}

func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

// Read uses a single consistent, read-only snapshot. The only private Auth
// field selected is the requesting user's creation date; identity is never
// obtained from query parameters. Public SELECT policies were inspected.
func (r *PostgresRepository) Read(ctx context.Context, userID string) (Record, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return Record{}, err
	}
	defer tx.Rollback(ctx)
	var record Record
	p := &record.Profile
	query, args := profileQuery, []any{userID}
	if r.canonical {
		query, args = canonicalProfileQuery, []any{"global", userID}
	}
	err = tx.QueryRow(ctx, query, args...).Scan(
		&p.Username, &p.Name, &p.Country, &p.Club, &p.Elo, &p.Wins, &p.Losses, &p.Draws,
		&p.DebatesCount, &p.UsernameChangedAt, &p.AvatarURL, &p.UpvotesReceived, &p.MVPCount,
		&record.CreatedAt, &p.Rank, &p.TotalDebaters)
	if errors.Is(err, pgx.ErrNoRows) {
		return Record{}, ErrNotFound
	}
	if err != nil {
		return Record{}, err
	}
	rows, err := tx.Query(ctx, historyQuery, userID)
	if err != nil {
		return Record{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var row HistoryRecord
		if err := rows.Scan(&row.ID, &row.Topic, &row.SideA, &row.SideB, &row.DebaterA,
			&row.Winner, &row.Result, &row.VotesA, &row.VotesB, &row.EloChange, &row.FinishedAt); err != nil {
			return Record{}, err
		}
		record.History = append(record.History, row)
	}
	if err := rows.Err(); err != nil {
		return Record{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Record{}, err
	}
	return record, nil
}

// Keep the legacy tie-break: compare OTHER profiles.created_at to THIS
// auth.users.created_at, not this profile's timestamp or its Elo.
const profileQuery = `
SELECT p.username, p.name, p.country, p.club,
       coalesce(p.elo,1200), coalesce(p.wins,0), coalesce(p.losses,0),
       coalesce(p.draws,0), coalesce(p.debates_count,0),
       to_jsonb(p.username_changed_at)#>>'{}', p.avatar_url,
       coalesce(p.upvotes_received,0), coalesce(p.mvp_count,0), u.created_at,
       1 + (SELECT count(*) FROM public.profiles other WHERE
         other.wins > coalesce(p.wins,0)
         OR (other.wins = coalesce(p.wins,0) AND other.losses < coalesce(p.losses,0))
         OR (other.wins = coalesce(p.wins,0) AND other.losses = coalesce(p.losses,0)
             AND other.debates_count > coalesce(p.debates_count,0))
         OR (other.wins = coalesce(p.wins,0) AND other.losses = coalesce(p.losses,0)
             AND other.debates_count = coalesce(p.debates_count,0) AND other.created_at < u.created_at)),
       (SELECT count(*) FROM public.profiles)
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.id = $1::uuid
`
const historyQuery = `
SELECT id::text, topic, side_a_label, side_b_label, debater_a_id::text,
       winner_id::text, result, coalesce(votes_a,0), coalesce(votes_b,0),
       coalesce(elo_change,0), finished_at
FROM public.debates
WHERE status = 'finished' AND (debater_a_id = $1::uuid OR debater_b_id = $1::uuid)
ORDER BY finished_at DESC
LIMIT 20
`
