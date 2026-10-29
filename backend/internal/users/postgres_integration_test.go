package users_test

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http/httptest"
	"net/url"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/GajapriyanV/SetPiece/backend/internal/auth"
	"github.com/GajapriyanV/SetPiece/backend/internal/database"
	"github.com/GajapriyanV/SetPiece/backend/internal/httpapi"
	"github.com/GajapriyanV/SetPiece/backend/internal/users"
	"github.com/jackc/pgx/v5"
)

//go:embed testdata/schema.sql
var schemaSQL string

//go:embed testdata/profile-contract.json
var contractJSON []byte

const caller = "11111111-1111-4111-8111-111111111111"
const other = "22222222-2222-4222-8222-222222222222"

type fixedAuth struct{}

func (fixedAuth) Verify(context.Context, string) (auth.Identity, error) {
	return auth.Identity{ID: caller}, nil
}

func TestPostgresProfileContract(t *testing.T) {
	uri := os.Getenv("SETPIECE_TEST_DATABASE_URL")
	if uri == "" {
		t.Skip("SETPIECE_TEST_DATABASE_URL not configured")
	}
	u, err := url.Parse(uri)
	if err != nil || (u.Hostname() != "127.0.0.1" && u.Hostname() != "localhost" && u.Hostname() != "::1") ||
		!strings.HasPrefix(strings.TrimPrefix(u.Path, "/"), "setpiece_m1_test_") {
		t.Fatal("profile fixtures require a loopback disposable database named setpiece_m1_test_*")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	admin, err := pgx.Connect(ctx, uri)
	if err != nil {
		t.Fatal("disposable database unavailable")
	}
	defer admin.Close(ctx)
	var existing *string
	if err := admin.QueryRow(ctx, "SELECT to_regclass('public.profiles')::text").Scan(&existing); err != nil || existing != nil {
		t.Fatal("fixture database must be empty")
	}
	if _, err := admin.Exec(ctx, schemaSQL); err != nil {
		t.Fatal(err)
	}
	ids := []string{caller, other}
	for i := 3; i <= 8; i++ {
		ids = append(ids, fmt.Sprintf("00000000-0000-4000-8000-%012d", i))
	}
	for _, id := range ids {
		if _, err := admin.Exec(ctx, "INSERT INTO auth.users(id,created_at) VALUES ($1,'2020-09-01T00:00:00Z')", id); err != nil {
			t.Fatal(err)
		}
	}
	_, err = admin.Exec(ctx, `INSERT INTO public.profiles(id,username,name,country,created_at,elo,wins,losses,draws,debates_count,upvotes_received,mvp_count)
	VALUES ($1,'player','','CA','2021-01-01',1240,3,2,3,8,5,2)`, caller)
	if err != nil {
		t.Fatal(err)
	}
	for i, row := range []struct {
		wins, losses, debates int
		created               string
	}{
		{4, 2, 8, "2021-01-01"}, {3, 1, 8, "2021-01-01"}, {3, 2, 9, "2021-01-01"},
		{3, 2, 8, "2020-08-01"}, {3, 2, 8, "2020-10-01"}, {2, 2, 8, "2021-01-01"},
	} {
		_, err = admin.Exec(ctx, "INSERT INTO public.profiles(id,wins,losses,debates_count,created_at) VALUES ($1,$2,$3,$4,$5::timestamptz)",
			ids[i+1], row.wins, row.losses, row.debates, row.created)
		if err != nil {
			t.Fatal(err)
		}
	}
	if _, err := admin.Exec(ctx, "INSERT INTO public.profiles(id) VALUES ($1)", ids[7]); err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Expected users.Profile
		Debates  []struct {
			ID, Topic  string
			SideA      string  `json:"side_a_label"`
			SideB      string  `json:"side_b_label"`
			DebaterA   string  `json:"debater_a_id"`
			DebaterB   string  `json:"debater_b_id"`
			Winner     *string `json:"winner_id"`
			Result     string
			VotesA     int        `json:"votes_a"`
			VotesB     int        `json:"votes_b"`
			EloChange  int        `json:"elo_change"`
			FinishedAt *time.Time `json:"finished_at"`
		}
	}
	if err := json.Unmarshal(contractJSON, &fixture); err != nil {
		t.Fatal(err)
	}
	for _, d := range fixture.Debates {
		_, err := admin.Exec(ctx, `INSERT INTO public.debates(id,room_code,topic,side_a_label,side_b_label,debater_a_id,debater_b_id,winner_id,result,votes_a,votes_b,elo_change,status,finished_at)
		VALUES ($1,'fixture',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'finished',$12)`,
			d.ID, d.Topic, d.SideA, d.SideB, d.DebaterA, d.DebaterB, d.Winner, d.Result, d.VotesA, d.VotesB, d.EloChange, d.FinishedAt)
		if err != nil {
			t.Fatal(err)
		}
	}
	pool, err := database.Open(ctx, uri, 2, 3*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	service := users.NewService(users.NewPostgresRepository(pool), time.UTC)
	result, err := service.ReadProfile(ctx, auth.Identity{ID: caller})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(result, fixture.Expected) {
		got, _ := json.Marshal(result)
		want, _ := json.Marshal(fixture.Expected)
		t.Fatalf("Go/legacy contract mismatch\ngot %s\nwant %s", got, want)
	}
	handler := httpapi.New(httpapi.Dependencies{Auth: fixedAuth{}, Database: pool, Profiles: service, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	request := httptest.NewRequest("GET", "/api/profile/me?userId="+other, nil)
	request.Header.Set("Authorization", "Bearer synthetic")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	var actual users.Profile
	if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &actual) != nil || !reflect.DeepEqual(actual, fixture.Expected) {
		t.Fatal("HTTP profile contract or identity isolation failed")
	}
	empty, err := service.ReadProfile(ctx, auth.Identity{ID: ids[7]})
	if err != nil || empty.Username != nil || empty.Name != nil || empty.Elo != 1200 || len(empty.Debates) != 0 {
		t.Fatal("empty profile defaults failed")
	}
	if _, err := service.ReadProfile(ctx, auth.Identity{ID: "99999999-9999-4999-8999-999999999999"}); !errors.Is(err, users.ErrNotFound) {
		t.Fatal("missing profile not detected")
	}
	if _, err := service.ReadProfile(ctx, auth.Identity{ID: "' OR true --"}); err == nil {
		t.Fatal("invalid identity accepted")
	}

	// Exclude other users and unfinished debates, and cap history to 20.
	_, err = admin.Exec(ctx, `INSERT INTO public.debates(room_code,topic,side_a_label,side_b_label,debater_a_id,status,finished_at)
	VALUES ('x','Other only','A','B',$1,'finished','2030-01-01'),
	       ('x','Still live','A','B',$2,'live','2030-01-01')`, other, caller)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 21; i++ {
		_, err = admin.Exec(ctx, `INSERT INTO public.debates(room_code,topic,side_a_label,side_b_label,debater_a_id,status,finished_at)
		VALUES ('x',$1,'A','B',$2,'finished',$3)`, fmt.Sprintf("Older %02d", i), caller, time.Date(2025, 1, i+1, 12, 0, 0, 0, time.UTC))
		if err != nil {
			t.Fatal(err)
		}
	}
	result, err = service.ReadProfile(ctx, auth.Identity{ID: caller})
	if err != nil || len(result.Debates) != 20 || result.Debates[0].Date != "—" {
		t.Fatal("history limit/null ordering failed")
	}
	for _, d := range result.Debates {
		if d.Topic == "Other only" || d.Topic == "Still live" || d.Topic == "Older 00" {
			t.Fatalf("unexpected history %s", d.Topic)
		}
	}
	cancelled, stop := context.WithCancel(ctx)
	stop()
	if _, err := service.ReadProfile(cancelled, auth.Identity{ID: caller}); err == nil {
		t.Fatal("cancelled query succeeded")
	}
	if err := pool.Ping(ctx); err != nil {
		t.Fatal("pool not usable after failure")
	}
}
