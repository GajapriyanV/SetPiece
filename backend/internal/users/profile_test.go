package users

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/GajapriyanV/SetPiece/backend/internal/auth"
)

type stubRepository struct {
	record   Record
	err      error
	received string
}

func (r *stubRepository) Read(_ context.Context, id string) (Record, error) {
	r.received = id
	return r.record, r.err
}
func ptr[T any](v T) *T { return &v }
func TestProfileFormatting(t *testing.T) {
	created := time.Date(2020, 9, 2, 0, 30, 0, 0, time.UTC)
	finished := time.Date(2026, 9, 1, 0, 30, 0, 0, time.UTC)
	repository := &stubRepository{record: Record{
		Profile:   Profile{Username: ptr("player"), Name: ptr(""), Elo: 1200},
		CreatedAt: &created,
		History: []HistoryRecord{
			{ID: "win", DebaterA: ptr("caller"), Winner: ptr("caller"), Result: ptr("side_a"), EloChange: 16, VotesA: 2, VotesB: 1, FinishedAt: &finished},
			{ID: "loss", DebaterA: ptr("other"), Winner: ptr("other"), Result: ptr("side_a"), EloChange: 12},
			{ID: "draw", DebaterA: ptr("caller"), Winner: ptr("caller"), Result: ptr("draw"), EloChange: 8},
		},
	}}
	result, err := NewService(repository, time.UTC).ReadProfile(context.Background(), auth.Identity{ID: "caller"})
	if err != nil {
		t.Fatal(err)
	}
	if repository.received != "caller" || result.Name == nil || *result.Name != "player" || result.JoinDate != "Sept 2020" {
		t.Fatalf("profile mapping failed: %+v", result)
	}
	for i, want := range []struct {
		side, result string
		elo          int
		date         string
	}{{"A", "WIN", 16, "1 Sept 2026"}, {"B", "LOSS", -12, "—"}, {"A", "DRAW", 0, "—"}} {
		got := result.Debates[i]
		if got.UserSide != want.side || got.Result != want.result || got.EloDelta != want.elo || got.Date != want.date {
			t.Fatalf("history %d: %+v", i, got)
		}
	}
	if result.Debates[0].CrowdCount != 3 {
		t.Fatal("wrong crowd count")
	}
	west := time.FixedZone("test west", -7*60*60)
	result, err = NewService(repository, west).ReadProfile(context.Background(), auth.Identity{ID: "caller"})
	if err != nil || result.Debates[0].Date != "31 Aug 2026" {
		t.Fatal("server timezone not preserved")
	}
}
func TestNullsEmptyHistoryAndErrors(t *testing.T) {
	repository := &stubRepository{}
	result, err := NewService(repository, time.UTC).ReadProfile(context.Background(), auth.Identity{ID: "caller"})
	if err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(result)
	for _, fragment := range []string{`"username":null`, `"name":null`, `"country":null`, `"club":null`, `"avatar_url":null`, `"username_changed_at":null`, `"debates":[]`} {
		if !strings.Contains(string(body), fragment) {
			t.Fatalf("missing %s in %s", fragment, body)
		}
	}
	repository.err = ErrNotFound
	if _, err := NewService(repository, time.UTC).ReadProfile(context.Background(), auth.Identity{ID: "caller"}); !errors.Is(err, ErrNotFound) {
		t.Fatal("missing profile error lost")
	}
}
