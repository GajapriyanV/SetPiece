package debates

import (
	"context"
	"encoding/json"
	"regexp"
)

// PublicRoom excludes membership identities and internal lifecycle state.
type PublicRoom struct {
	ID          string `json:"roomId"`
	Topic       string `json:"topic"`
	SideA       string `json:"sideALabel"`
	SideB       string `json:"sideBLabel"`
	Status      string `json:"status"`
	MemberCount int    `json:"memberCount"`
	Featured    bool   `json:"isFeatured"`
	Completed   int    `json:"debatesCompleted"`
	MaxDebates  int    `json:"maxDebates"`
}

func (p *Postgres) PublicPage(ctx context.Context, after string, limit int) ([]PublicRoom, string, error) {
	if limit < 1 || limit > 100 || (after != "" && !regexp.MustCompile(`^[a-f0-9]{8}$`).MatchString(after)) {
		return nil, "", ErrInvalid
	}
	rows, e := p.pool.Query(ctx, `SELECT r.id,r.snapshot,
 (SELECT count(*) FROM setpiece_runtime.members m WHERE m.room_id=r.id)
 FROM setpiece_runtime.rooms r WHERE NOT r.closed AND r.id>$1
 AND r.snapshot->>'status' <> 'closing' ORDER BY r.id LIMIT $2`, after, limit+1)
	if e != nil {
		return nil, "", e
	}
	defer rows.Close()
	out := []PublicRoom{}
	cursor := ""
	for rows.Next() {
		var id string
		var data []byte
		var count int
		if e = rows.Scan(&id, &data, &count); e != nil {
			return nil, "", e
		}
		if len(out) == limit {
			cursor = out[len(out)-1].ID
			break
		}
		var r Room
		if e = json.Unmarshal(data, &r); e != nil {
			return nil, "", e
		}
		topic := r.Topic()
		status := r.Status
		if status == "countdown" {
			status = "live"
		}
		if status == "awaiting_result" {
			status = "voting"
		}
		out = append(out, PublicRoom{ID: id, Topic: topic.Topic, SideA: topic.SideA, SideB: topic.SideB, Status: status, MemberCount: count, Featured: r.Featured, Completed: r.Completed, MaxDebates: 5})
	}
	return out, cursor, rows.Err()
}
func (p *Postgres) LiveCount(ctx context.Context) (int, error) {
	var count int
	e := p.pool.QueryRow(ctx, `SELECT count(*) FROM setpiece_runtime.members m
 JOIN setpiece_runtime.rooms r ON r.id=m.room_id WHERE NOT r.closed AND r.snapshot->>'status'<>'closing'`).Scan(&count)
	return count, e
}
