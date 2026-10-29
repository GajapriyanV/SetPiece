// Package application provides transaction and validation helpers shared by application services.
package application

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"regexp"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

var ErrInvalid = errors.New("invalid request")
var ErrForbidden = errors.New("forbidden")
var ErrNotFound = errors.New("not found")
var ErrClosed = errors.New("thread is closed")
var ErrReadOnly = errors.New("writes disabled")
var ErrTooLarge = errors.New("thread too large")
var uuid = regexp.MustCompile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

func ID(s string) bool { return uuid.MatchString(s) }

// Match JavaScript string.length, including surrogate pairs.
func Text(s string, max int) bool {
	return utf8.ValidString(s) && strings.TrimSpace(s) != "" && len(utf16.Encode([]rune(s))) <= max && !strings.ContainsRune(s, 0)
}

type Store struct {
	Pool     *pgxpool.Pool
	Writable bool
}

func (s Store) Write(ctx context.Context, fn func(pgx.Tx) (json.RawMessage, error)) (json.RawMessage, error) {
	if !s.Writable {
		return nil, ErrReadOnly
	}
	tx, e := s.Pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if e != nil {
		return nil, e
	}
	defer tx.Rollback(ctx)
	result, e := fn(tx)
	if e != nil {
		return nil, e
	}
	if e = tx.Commit(ctx); e != nil {
		return nil, e
	}
	return result, nil
}
func Admin(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, id string) error {
	var admin bool
	e := q.QueryRow(ctx, "SELECT is_admin FROM public.profiles WHERE id=$1::uuid", id).Scan(&admin)
	if errors.Is(e, pgx.ErrNoRows) || e == nil && !admin {
		return ErrForbidden
	}
	return e
}
func JSON(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, sql string, args ...any) (json.RawMessage, error) {
	var out []byte
	e := q.QueryRow(ctx, sql, args...).Scan(&out)
	if errors.Is(e, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return out, e
}

var OK = json.RawMessage(`{"ok":true}`)
