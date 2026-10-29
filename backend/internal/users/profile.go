package users

import (
	"context"
	"errors"
	"time"

	"github.com/GajapriyanV/SetPiece/backend/internal/auth"
)

var ErrNotFound = errors.New("profile not found")

// Profile is the existing Next.js GET /api/profile/me response contract.
type Profile struct {
	Username          *string  `json:"username"`
	Name              *string  `json:"name"`
	Country           *string  `json:"country"`
	Club              *string  `json:"club"`
	Elo               int      `json:"elo"`
	Wins              int      `json:"wins"`
	Losses            int      `json:"losses"`
	Draws             int      `json:"draws"`
	DebatesCount      int      `json:"debates_count"`
	Rank              int64    `json:"rank"`
	TotalDebaters     int64    `json:"totalDebaters"`
	JoinDate          string   `json:"joinDate"`
	UsernameChangedAt *string  `json:"username_changed_at"`
	AvatarURL         *string  `json:"avatar_url"`
	UpvotesReceived   int      `json:"upvotes_received"`
	MVPCount          int      `json:"mvp_count"`
	Debates           []Debate `json:"debates"`
}
type Debate struct {
	ID         string `json:"id"`
	Topic      string `json:"topic"`
	SideA      string `json:"sideA"`
	SideB      string `json:"sideB"`
	UserSide   string `json:"userSide"`
	Result     string `json:"result"`
	EloDelta   int    `json:"eloDelta"`
	CrowdCount int    `json:"crowdCount"`
	Date       string `json:"date"`
}
type Record struct {
	Profile   Profile
	CreatedAt *time.Time
	History   []HistoryRecord
}
type HistoryRecord struct {
	ID, Topic, SideA, SideB   string
	DebaterA, Winner, Result  *string
	EloChange, VotesA, VotesB int
	FinishedAt                *time.Time
}
type Repository interface {
	Read(context.Context, string) (Record, error)
}
type Service struct {
	repository Repository
	location   *time.Location
}

func NewService(repository Repository, location *time.Location) *Service {
	if location == nil {
		location = time.Local
	}
	return &Service{repository: repository, location: location}
}
func (s *Service) ReadProfile(ctx context.Context, identity auth.Identity) (Profile, error) {
	record, err := s.repository.Read(ctx, identity.ID)
	if err != nil {
		return Profile{}, err
	}
	profile := record.Profile
	if profile.Name == nil || *profile.Name == "" {
		profile.Name = profile.Username
	}
	profile.JoinDate = "Invalid Date"
	if record.CreatedAt != nil {
		profile.JoinDate = monthYear(record.CreatedAt.In(s.location))
	}
	profile.Debates = make([]Debate, 0, len(record.History))
	for _, row := range record.History {
		debate := Debate{ID: row.ID, Topic: row.Topic, SideA: row.SideA, SideB: row.SideB,
			UserSide: "B", Result: "LOSS", EloDelta: -row.EloChange,
			CrowdCount: row.VotesA + row.VotesB, Date: "—"}
		if row.DebaterA != nil && *row.DebaterA == identity.ID {
			debate.UserSide = "A"
		}
		if row.Result != nil && *row.Result == "draw" {
			debate.Result, debate.EloDelta = "DRAW", 0
		} else if row.Winner != nil && *row.Winner == identity.ID {
			debate.Result, debate.EloDelta = "WIN", row.EloChange
		}
		if row.FinishedAt != nil {
			finished := row.FinishedAt.In(s.location)
			debate.Date = finished.Format("2") + " " + monthYear(finished)
		}
		profile.Debates = append(profile.Debates, debate)
	}
	return profile, nil
}

// Intl en-GB uses "Sept", while Go's Jan layout uses "Sep".
func monthYear(t time.Time) string {
	months := [...]string{"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"}
	return months[t.Month()-1] + " " + t.Format("2006")
}
