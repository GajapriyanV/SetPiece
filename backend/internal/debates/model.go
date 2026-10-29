// Package debates owns durable lifecycle rules, independent of HTTP/WebSocket/media.
package debates

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"
)

var (
	ErrNotFound     = errors.New("room not found")
	ErrForbidden    = errors.New("room membership required")
	ErrConflict     = errors.New("room state conflict")
	ErrInvalid      = errors.New("invalid room command")
	ErrStale        = errors.New("stale room revision")
	ErrNotFinalized = errors.New("debate not finalized")
)

type Topic struct {
	Topic string `json:"topic"`
	SideA string `json:"sideALabel"`
	SideB string `json:"sideBLabel"`
}
type Member struct {
	UserID   string     `json:"userId"`
	Side     string     `json:"side"`
	Ready    bool       `json:"isReady"`
	Slot     int        `json:"-"`
	JoinedAt time.Time  `json:"joinedAt"`
	DepartAt *time.Time `json:"departAt,omitempty"`
	Restart  bool       `json:"-"`
}
type Room struct {
	ID         string            `json:"roomId"`
	Revision   int64             `json:"revision"`
	Creator    string            `json:"creatorId"`
	Featured   bool              `json:"isFeatured"`
	Topics     []Topic           `json:"topics"`
	TopicIndex int               `json:"topicIndex"`
	Completed  int               `json:"debatesCompleted"`
	Status     string            `json:"status"`
	PhaseIndex int               `json:"phaseIndex"`
	DebateID   string            `json:"debateId"`
	DebaterA   string            `json:"debaterAId"`
	DebaterB   string            `json:"debaterBId"`
	CreatedAt  time.Time         `json:"createdAt"`
	Deadline   *time.Time        `json:"deadline,omitempty"`
	EmptyAt    *time.Time        `json:"emptyAt,omitempty"`
	InactiveAt *time.Time        `json:"inactiveAt,omitempty"`
	RecoveryAt *time.Time        `json:"recoveryAt,omitempty"`
	SkipVoters map[string]bool   `json:"skipVoters"`
	Members    map[string]Member `json:"members"`
}
type Phase struct {
	Name, Speaker string
	Duration      time.Duration
}

var phases = [...]Phase{
	{"opening_a", "a", 150 * time.Second}, {"opening_b", "b", 150 * time.Second},
	{"rebuttal_a", "a", 60 * time.Second}, {"rebuttal_b", "b", 60 * time.Second},
	{"closing_a", "a", 30 * time.Second}, {"closing_b", "b", 30 * time.Second},
}

func (r Room) Phase() *Phase {
	if r.Status != "live" || r.PhaseIndex < 0 || r.PhaseIndex >= len(phases) {
		return nil
	}
	p := phases[r.PhaseIndex]
	return &p
}
func (r Room) Capacity() int {
	if r.Featured {
		return 50
	}
	return 6
}
func (r Room) Topic() Topic                           { return r.Topics[r.TopicIndex] }
func (r Room) speaker(id string) bool                 { return id != "" && (id == r.DebaterA || id == r.DebaterB) }
func after(now time.Time, d time.Duration) *time.Time { t := now.Add(d); return &t }
func due(t *time.Time, now time.Time) bool            { return t != nil && !now.Before(*t) }
func id(n int) (string, error) {
	b := make([]byte, n)
	if _, e := rand.Read(b); e != nil {
		return "", e
	}
	return hex.EncodeToString(b), nil
}
func debateID() (string, error) {
	b := make([]byte, 16)
	if _, e := rand.Read(b); e != nil {
		return "", e
	}
	b[6] = (b[6] & 15) | 64
	b[8] = (b[8] & 63) | 128
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:]), nil
}
func newRoom(creator string, topics []Topic, featured bool, now time.Time) (Room, error) {
	if creator == "" || len(topics) < 1 || len(topics) > 15 || (!featured && len(topics) != 1) {
		return Room{}, ErrInvalid
	}
	topics = append([]Topic(nil), topics...)
	for i := range topics {
		topics[i].Topic = strings.TrimSpace(topics[i].Topic)
		topics[i].SideA = strings.TrimSpace(topics[i].SideA)
		topics[i].SideB = strings.TrimSpace(topics[i].SideB)
		if topics[i].Topic == "" || len(topics[i].Topic) > 500 || topics[i].SideA == "" || len(topics[i].SideA) > 200 || topics[i].SideB == "" || len(topics[i].SideB) > 200 {
			return Room{}, ErrInvalid
		}
	}
	if featured {
		for i := len(topics) - 1; i > 0; i-- {
			j, e := rand.Int(rand.Reader, big.NewInt(int64(i+1)))
			if e != nil {
				return Room{}, e
			}
			topics[i], topics[int(j.Int64())] = topics[int(j.Int64())], topics[i]
		}
	}
	roomID, e := id(4)
	if e != nil {
		return Room{}, e
	}
	r := Room{ID: roomID, Revision: 1, Creator: creator, Topics: topics, Featured: featured, Status: "lobby", PhaseIndex: -1, CreatedAt: now, Members: map[string]Member{}, SkipVoters: map[string]bool{}}
	if featured {
		r.InactiveAt = after(now, 40*time.Minute)
	} else {
		r.EmptyAt = after(now, 3*time.Minute)
	}
	return r, nil
}
func (r *Room) Join(user string, now time.Time) error {
	if r.Status == "closing" || r.Status == "closed" {
		return ErrConflict
	}
	if m, ok := r.Members[user]; ok {
		m.DepartAt = nil
		m.Restart = false
		r.Members[user] = m
		return nil
	}
	if len(r.Members) >= r.Capacity() {
		return ErrConflict
	}
	used := map[int]bool{}
	for _, m := range r.Members {
		used[m.Slot] = true
	}
	slot := 1
	for used[slot] {
		slot++
	}
	r.Members[user] = Member{UserID: user, Slot: slot, JoinedAt: now}
	r.EmptyAt = nil
	if r.Featured && r.Status == "lobby" && r.Deadline == nil && len(r.Members) >= 2 {
		r.Deadline = after(now, 30*time.Second)
		r.InactiveAt = after(now, 40*time.Minute)
	}
	return nil
}
func (r *Room) Pick(user, side string) error {
	m, ok := r.Members[user]
	if !ok || m.DepartAt != nil {
		return ErrForbidden
	}
	if r.Status != "lobby" {
		return ErrConflict
	}
	if side != "" && side != "a" && side != "b" {
		return ErrInvalid
	}
	for uid, other := range r.Members {
		if side != "" && uid != user && other.Side == side {
			return ErrConflict
		}
	}
	m.Side = side
	m.Ready = false
	r.Members[user] = m
	return nil
}
func (r *Room) Ready(user string, now time.Time) error {
	m, ok := r.Members[user]
	if !ok || m.DepartAt != nil {
		return ErrForbidden
	}
	if r.Status == "countdown" && r.speaker(user) {
		return nil
	} // identical ready retry
	if r.Status != "lobby" || m.Side == "" {
		return ErrConflict
	}
	m.Ready = true
	r.Members[user] = m
	a, b := "", ""
	for uid, v := range r.Members {
		if v.Ready && v.DepartAt == nil {
			if v.Side == "a" {
				a = uid
			}
			if v.Side == "b" {
				b = uid
			}
		}
	}
	if a != "" && b != "" {
		debate, e := debateID()
		if e != nil {
			return e
		}
		r.DebateID = debate
		r.DebaterA = a
		r.DebaterB = b
		r.Status = "countdown"
		r.PhaseIndex = -1
		r.Deadline = after(now, 5*time.Second)
		r.SkipVoters = map[string]bool{}
	}
	return nil
}
func (r *Room) Skip(user string, now time.Time) error {
	if m, ok := r.Members[user]; !ok || m.DepartAt != nil {
		return ErrForbidden
	}
	if !r.Featured || r.Status != "lobby" {
		return ErrConflict
	}
	r.SkipVoters[user] = true
	if len(r.SkipVoters) >= 2 {
		r.reset(now, true)
	}
	return nil
}
func (r *Room) reset(now time.Time, advance bool) {
	r.Status = "lobby"
	r.PhaseIndex = -1
	r.DebateID = ""
	r.DebaterA = ""
	r.DebaterB = ""
	r.Deadline = nil
	r.RecoveryAt = nil
	r.SkipVoters = map[string]bool{}
	for uid, m := range r.Members {
		m.Side = ""
		m.Ready = false
		r.Members[uid] = m
	}
	if r.Featured {
		if advance {
			r.TopicIndex = (r.TopicIndex + 1) % len(r.Topics)
		}
		r.InactiveAt = after(now, 40*time.Minute)
		if len(r.Members) >= 2 {
			r.Deadline = after(now, 30*time.Second)
		}
	} else if len(r.Members) == 0 {
		r.EmptyAt = after(now, 3*time.Minute)
	}
}
func (r *Room) Leave(user string, now time.Time, preserveVoting bool) {
	delete(r.Members, user)
	delete(r.SkipVoters, user)
	if r.speaker(user) && (r.Status == "countdown" || r.Status == "live" || (r.Status == "voting" && !preserveVoting)) {
		r.reset(now, false)
	}
	if len(r.Members) == 0 && !r.Featured && r.Status != "awaiting_result" {
		r.EmptyAt = after(now, 3*time.Minute)
	}
}
func (r *Room) Disconnect(user string, now time.Time) {
	m, ok := r.Members[user]
	if !ok || m.DepartAt != nil {
		return
	}
	grace := 30 * time.Second
	if (r.speaker(user) && (r.Status == "countdown" || r.Status == "live" || r.Status == "voting")) || (r.Status == "lobby" && m.Side != "") {
		grace = 15 * time.Second
	}
	m.DepartAt = after(now, grace)
	m.Restart = false
	r.Members[user] = m
}

// Recover runs before accepting new connections in a single-owner process.
// It preserves an existing recovery deadline so repeated crashes do not extend it.
func (r *Room) Recover(now time.Time, grace time.Duration) {
	if r.Status == "closed" {
		return
	}
	for uid, m := range r.Members {
		if m.DepartAt == nil {
			g := 30 * time.Second
			if r.speaker(uid) || m.Side != "" {
				g = grace
			}
			m.DepartAt = after(now, g)
		}
		m.Restart = true
		r.Members[uid] = m
	}
	if (r.Status == "live" || r.Status == "countdown") && r.RecoveryAt == nil {
		r.RecoveryAt = after(now, grace)
	}
}

// Advance consumes due deadlines in chronological order. Revision checks in the
// repository reject old scheduler work; times are anchored to persisted deadlines.
func (r *Room) Advance(now time.Time) {
	if r.Status == "closed" {
		return
	}
	if r.RecoveryAt != nil {
		a, aOK := r.Members[r.DebaterA]
		b, bOK := r.Members[r.DebaterB]
		if aOK && bOK && a.DepartAt == nil && b.DepartAt == nil {
			r.RecoveryAt = nil
		} else if due(r.RecoveryAt, now) {
			r.reset(now, false)
		} else {
			return
		}
	}
	// Bounded: six phases plus countdown/voting/results; featured topic expiry
	// resets relative to now so a long outage cannot spin through empty topics.
	for step := 0; step < 12; step++ {
		var next *time.Time
		kind, user := "", ""
		choose := func(t *time.Time, k, u string) {
			if due(t, now) && (next == nil || t.Before(*next)) {
				next = t
				kind = k
				user = u
			}
		}
		for uid, m := range r.Members {
			choose(m.DepartAt, "departure", uid)
		}
		choose(r.Deadline, "phase", "")
		choose(r.EmptyAt, "empty", "")
		choose(r.InactiveAt, "inactive", "")
		if next == nil {
			return
		}
		at := *next
		switch kind {
		case "departure":
			m := r.Members[user]
			r.Leave(user, at, m.Restart)
		case "empty":
			r.EmptyAt = nil
			if len(r.Members) == 0 && r.Status != "awaiting_result" && r.Status != "voting" && r.Status != "results" {
				r.Status = "closed"
				r.Deadline = nil
				return
			}
		case "inactive":
			r.InactiveAt = nil
			if len(r.Members) == 0 && r.Status == "lobby" {
				r.Status = "closing"
				r.Deadline = after(now, 30*time.Second)
			} else if r.Status != "closing" {
				r.InactiveAt = after(now, 40*time.Minute)
			}
		case "phase":
			switch r.Status {
			case "lobby":
				r.reset(now, true)
			case "countdown":
				r.Status = "live"
				r.PhaseIndex = 0
				r.Deadline = after(at, phases[0].Duration)
			case "live":
				r.PhaseIndex++
				if r.PhaseIndex == len(phases) {
					r.Status = "voting"
					r.PhaseIndex = -1
					r.Deadline = after(at, 30*time.Second)
				} else {
					r.Deadline = after(at, phases[r.PhaseIndex].Duration)
				}
			case "voting":
				r.Status = "awaiting_result"
				r.Deadline = nil
			case "results":
				if r.Featured {
					r.Completed++
				}
				if r.Featured && r.Completed >= 5 {
					r.Status = "closing"
					r.Deadline = after(at, 30*time.Second)
					r.InactiveAt = nil
				} else {
					r.reset(at, true)
				}
			case "closing":
				r.Status = "closed"
				r.Deadline = nil
				r.InactiveAt = nil
				r.EmptyAt = nil
				return
			default:
				r.Deadline = nil
			}
		}
	}
}
func (r Room) NextDue() *time.Time {
	var next *time.Time
	take := func(t *time.Time) {
		if t != nil && (next == nil || t.Before(*next)) {
			v := *t
			next = &v
		}
	}
	if r.Status == "closed" {
		return nil
	}
	if r.RecoveryAt != nil {
		return r.RecoveryAt
	}
	take(r.Deadline)
	take(r.EmptyAt)
	take(r.InactiveAt)
	for _, m := range r.Members {
		take(m.DepartAt)
	}
	return next
}
