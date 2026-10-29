package users

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/GajapriyanV/SetPiece/backend/internal/auth"
	"github.com/GajapriyanV/SetPiece/backend/internal/leaderboard"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrInvalid = errors.New("invalid profile fields")
var ErrUsername = errors.New("username already taken")
var ErrCooldown = errors.New("username can only change every 14 days")
var ErrReadOnly = errors.New("profile writes are not enabled")

type Edit struct {
	Name      string  `json:"name"`
	Username  string  `json:"username"`
	Country   *string `json:"country"`
	Club      *string `json:"club"`
	AvatarURL *string `json:"avatar_url"`
}
type Account struct {
	Pool        *pgxpool.Pool
	Writable    bool
	SupabaseURL string
	Location    *time.Location
}

func validText(s string, max int) bool {
	return utf8.ValidString(s) && utf8.RuneCountInString(s) <= max && !strings.ContainsFunc(s, unicode.IsControl)
}
func ValidateEdit(e *Edit) error {
	e.Name = strings.TrimSpace(e.Name)
	e.Username = strings.TrimSpace(e.Username)
	if e.Name == "" || e.Username == "" || !validText(e.Name, 100) || !validText(e.Username, 64) || strings.ContainsAny(e.Username, "/\\?#") {
		return ErrInvalid
	}
	for _, s := range []*string{e.Country, e.Club} {
		if s != nil && (!validText(*s, 100) || strings.TrimSpace(*s) != *s) {
			return ErrInvalid
		}
	}
	return nil
}

// Only a public URL within this user's avatar directory may be newly assigned.
// Unchanged historical URLs are retained, so existing providers remain readable.
func (a *Account) validAvatar(userID, value string) bool {
	base, e := url.Parse(a.SupabaseURL)
	if e != nil {
		return false
	}
	u, e := url.Parse(value)
	if e != nil || u.Scheme != base.Scheme || u.Host != base.Host || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return false
	}
	prefix := "/storage/v1/object/public/avatars/" + userID + "/"
	if !strings.HasPrefix(u.Path, prefix) {
		return false
	}
	file := strings.TrimPrefix(u.Path, prefix)
	return file != "" && file != "." && file != ".." && !strings.ContainsAny(file, "/\\") && validText(file, 255)
}
func (a *Account) Edit(ctx context.Context, id auth.Identity, input Edit, onboarding bool) (json.RawMessage, error) {
	if !a.Writable {
		return nil, ErrReadOnly
	}
	if err := ValidateEdit(&input); err != nil {
		return nil, err
	}
	tx, err := a.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if onboarding {
		// Defaults own all privileged fields. Concurrent first completion serializes on the PK.
		_, err = tx.Exec(ctx, "INSERT INTO public.profiles(id) VALUES($1::uuid) ON CONFLICT(id) DO NOTHING", id.ID)
		if err != nil {
			return nil, err
		}
	}
	var username, avatar *string
	var canChange, complete bool
	err = tx.QueryRow(ctx, `SELECT username,avatar_url,username_changed_at <= clock_timestamp()-interval '14 days',
 coalesce(registration_complete,false) FROM public.profiles WHERE id=$1::uuid FOR NO KEY UPDATE`, id.ID).Scan(&username, &avatar, &canChange, &complete)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	// A retried onboarding completion returns committed truth, never replays an old form.
	if !(onboarding && complete) {
		changed := username == nil || *username != input.Username
		if changed && username != nil && !canChange {
			return nil, ErrCooldown
		}
		if onboarding {
			input.AvatarURL = avatar
		}
		if input.AvatarURL != nil && (avatar == nil || *input.AvatarURL != *avatar) && !a.validAvatar(id.ID, *input.AvatarURL) {
			return nil, ErrInvalid
		}
		_, err = tx.Exec(ctx, `UPDATE public.profiles SET name=$2,username=$3,country=$4,club=$5,avatar_url=$6,
 updated_at=clock_timestamp(),username_changed_at=CASE WHEN username IS DISTINCT FROM $3 THEN clock_timestamp() ELSE username_changed_at END,
 registration_complete=CASE WHEN $7 THEN true ELSE registration_complete END WHERE id=$1::uuid`,
			id.ID, input.Name, input.Username, input.Country, input.Club, input.AvatarURL, onboarding)
		if err != nil {
			var pg *pgconn.PgError
			if errors.As(err, &pg) && pg.Code == "23505" {
				return nil, ErrUsername
			}
			return nil, err
		}
	}
	body, err := self(ctx, tx, id.ID)
	if err != nil {
		return nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return body, nil
}

type rowQuery interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

func self(ctx context.Context, q rowQuery, id string) (json.RawMessage, error) {
	var body []byte
	err := q.QueryRow(ctx, `SELECT jsonb_build_object('id',id,'username',username,'name',coalesce(nullif(name,''),username),
 'country',country,'club',club,'avatar_url',avatar_url,'username_changed_at',username_changed_at,
 'is_admin',coalesce(is_admin,false),'registration_complete',coalesce(registration_complete,false))
 FROM public.profiles WHERE id=$1::uuid`, id).Scan(&body)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return body, err
}
func (a *Account) Self(ctx context.Context, id auth.Identity) (json.RawMessage, error) {
	return self(ctx, a.Pool, id.ID)
}
func (a *Account) Available(ctx context.Context, id auth.Identity, username string) (bool, error) {
	if username == "" || !validText(username, 64) {
		return false, ErrInvalid
	}
	var available bool
	err := a.Pool.QueryRow(ctx, "SELECT NOT EXISTS(SELECT 1 FROM public.profiles WHERE username=$1 AND id<>$2::uuid)", username, id.ID).Scan(&available)
	return available, err
}
func (a *Account) ReadProfile(ctx context.Context, id auth.Identity) (Profile, error) {
	repo := NewPostgresRepository(a.Pool)
	repo.canonical = true
	return NewService(repo, a.Location).ReadProfile(ctx, id)
}
func (a *Account) Public(ctx context.Context, username string) (map[string]any, error) {
	if username == "" || !validText(username, 64) {
		return nil, ErrInvalid
	}
	var id string
	err := a.Pool.QueryRow(ctx, "SELECT id::text FROM public.profiles WHERE username=$1", username).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	p, err := a.ReadProfile(ctx, auth.Identity{ID: id})
	if err != nil {
		return nil, err
	}
	if p.Username == nil || *p.Username != username {
		return nil, ErrNotFound
	}
	raw, _ := json.Marshal(p)
	var result map[string]any
	_ = json.Unmarshal(raw, &result)
	delete(result, "username_changed_at")
	return result, nil
}

var canonicalProfileQuery = leaderboard.CTE(leaderboard.Filter{Type: "unranked", Period: "alltime"}) + `
 SELECT p.username,p.name,p.country,p.club,p.elo,p.wins,p.losses,p.draws,p.debates_count,
 to_jsonb(p.username_changed_at)#>>'{}',p.avatar_url,p.upvotes_received,p.mvp_count,p.created_at,
 r.rank,(SELECT count(*) FROM public.profiles)
 FROM public.profiles p JOIN ranked r ON r.id=p.id WHERE p.id=$2::uuid`

func (a *Account) Stats(ctx context.Context) (json.RawMessage, error) {
	location := a.Location
	if location == nil {
		location = time.UTC
	}
	now := time.Now().In(location)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, location)
	var body []byte
	err := a.Pool.QueryRow(ctx, `WITH counts AS (
 SELECT count(*) FILTER(WHERE created_at >= $1) today,
 count(*) FILTER(WHERE created_at >= $2 AND created_at < $1) yesterday,
 coalesce(sum(votes_a::bigint+votes_b::bigint) FILTER(WHERE status='finished'),0) votes FROM public.debates)
 SELECT jsonb_build_object('mostWins',(SELECT jsonb_build_object('username',username,'wins',wins) FROM public.profiles ORDER BY wins DESC,id ASC LIMIT 1),
 'debatesToday',today,'debatesPctChange',CASE WHEN yesterday=0 THEN NULL ELSE floor((today-yesterday)::numeric*100/yesterday+0.5)::bigint END,
 'votesCastAllTime',votes) FROM counts`, today, today.AddDate(0, 0, -1)).Scan(&body)
	return body, err
}
