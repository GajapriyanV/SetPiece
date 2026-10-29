package main

import (
	"context"
	"github.com/GajapriyanV/SetPiece/backend/internal/debates"
	"github.com/jackc/pgx/v5/pgxpool"
)

type runtimeControl struct {
	*debates.Service
	pool *pgxpool.Pool
}

func (r *runtimeControl) ActiveDebates(ctx context.Context) (int, error) {
	var active int
	err := r.pool.QueryRow(ctx, "SELECT count(*) FROM setpiece_runtime.rooms WHERE NOT closed AND snapshot->>'status' IN ('countdown','live','voting','awaiting_result','results')").Scan(&active)
	return active, err
}
