package livekit

import (
	"context"
	"github.com/GajapriyanV/SetPiece/backend/internal/debates"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresStore struct {
	*debates.Postgres
	pool *pgxpool.Pool
}

func NewStore(pool *pgxpool.Pool) *PostgresStore {
	return &PostgresStore{debates.NewPostgres(pool), pool}
}
func (s *PostgresStore) Name(ctx context.Context, user string) (string, error) {
	var name string
	e := s.pool.QueryRow(ctx, "SELECT coalesce(username,'Member') FROM public.profiles WHERE id=$1", user).Scan(&name)
	return name, e
}
