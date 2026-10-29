package realtime

import (
	"reflect"
	"time"
)

// Events are advisory deltas for baseline consumers. Every committed view is
// followed by a full snapshot; delivery can coalesce revisions after outages.
func changes(old, cur View, now time.Time) []Envelope {
	out := []Envelope{}
	emit := func(kind string, data any) {
		out = append(out, Envelope{Version: 1, Type: kind, RoomID: cur.Room.ID, Revision: cur.Room.Revision, Data: data})
	}
	a, b := old.Room, cur.Room
	for _, id := range memberIDs(b) {
		m := b.Members[id]
		before, ok := a.Members[id]
		if !ok {
			emit("room:member_joined", cur.brief(id))
		}
		if !ok || m.Ready != before.Ready {
			emit("side:ready_updated", map[string]any{"userId": id, "isReady": m.Ready})
		}
		if ok && ((before.DepartAt == nil) != (m.DepartAt == nil)) && (id == b.DebaterA || id == b.DebaterB) {
			name := "debate:debater_reconnected"
			if m.DepartAt != nil {
				name = "debate:debater_disconnected"
			}
			emit(name, cur.brief(id))
			if b.Featured && m.DepartAt != nil {
				emit("featured:debater_disconnected", cur.brief(id))
			}
		}
	}
	for _, id := range memberIDs(a) {
		if _, ok := b.Members[id]; !ok {
			emit("room:member_left", map[string]string{"userId": id})
		}
	}
	if !reflect.DeepEqual(a.Members, b.Members) {
		sa, sb, spectators := cur.sides()
		emit("side:updated", map[string]any{"sides": map[string]any{"a": sa, "b": sb}, "spectators": spectators})
	}
	if a.DebateID != "" && b.DebateID == "" && (a.Status == "countdown" || a.Status == "live" || a.Status == "voting") {
		username := ""
		for _, id := range []string{a.DebaterA, a.DebaterB} {
			m, ok := b.Members[id]
			if !ok || m.DepartAt != nil {
				if person := old.brief(id); person != nil {
					username = person.Username
				}
				break
			}
		}
		data := map[string]string{"reason": "Debater left or recovery expired", "username": username}
		emit("debate:cancelled", data)
		if b.Featured {
			emit("featured:debate_cancelled", data)
		}
	}
	if b.Status == "countdown" && (a.Status != "countdown" || a.DebateID != b.DebateID) {
		seconds := 0
		if b.Deadline != nil {
			seconds = int(b.Deadline.Sub(now).Seconds() + 0.999)
			if seconds < 0 {
				seconds = 0
			}
		}
		emit("debate:starting", map[string]any{"debateId": b.DebateID, "countdown": seconds})
	}
	if b.Status == "live" && (a.Status != "live" || a.PhaseIndex != b.PhaseIndex) {
		p := b.Phase()
		emit("debate:phase_change", map[string]any{"phase": p.Name, "speaker": p.Speaker, "endsAt": ms(b.Deadline), "index": b.PhaseIndex})
	}
	if b.Status == "voting" && a.Status != "voting" {
		emit("debate:ended", nil)
		emit("vote:window_open", map[string]any{"endsAt": ms(b.Deadline)})
	}
	if a.Status == "voting" && b.Status != "voting" {
		emit("vote:window_closed", nil)
	}
	if old.VotesA != cur.VotesA || old.VotesB != cur.VotesB || a.DebateID != b.DebateID {
		emit("vote:count_update", map[string]int{"a": cur.VotesA, "b": cur.VotesB, "total": cur.VotesA + cur.VotesB})
	}
	if cur.Result != nil && (old.Result == nil || old.Result.FinishedAt != cur.Result.FinishedAt) {
		emit("results:final", cur.Result)
	}
	topicChanged := a.TopicIndex != b.TopicIndex || !reflect.DeepEqual(a.Topic(), b.Topic())
	// A one-topic featured queue can wrap to the same index: a replaced lobby
	// deadline and cleared skip set still represent a new reveal.
	reveal := b.Featured && b.Status == "lobby" && (topicChanged || a.Status != "lobby" || (a.Deadline != nil && !reflect.DeepEqual(a.Deadline, b.Deadline)))
	if topicChanged || reveal {
		emit("topic:change", b.Topic())
	}
	if reveal {
		if a.Status == "lobby" && a.Deadline != nil {
			emit("featured:topic_skipped", map[string]string{"reason": "Topic skipped or side-pick deadline expired"})
		}
		t := b.Topic()
		var sidePickEndsAt int64
		if b.Deadline != nil {
			sidePickEndsAt = b.Deadline.UnixMilli()
		}
		emit("featured:topic_reveal", map[string]any{"topic": t.Topic, "sideALabel": t.SideA, "sideBLabel": t.SideB, "topicIndex": b.TopicIndex, "debatesCompleted": b.Completed, "sidePickEndsAt": sidePickEndsAt})
	}
	if b.Featured && b.Status == "lobby" && b.Deadline != nil && !reflect.DeepEqual(a.Deadline, b.Deadline) {
		emit("featured:side_pick_started", map[string]any{"sidePickEndsAt": ms(b.Deadline)})
	}
	if a.Completed != b.Completed {
		emit("featured:debate_complete", map[string]int{"debatesCompleted": b.Completed, "maxDebates": 5})
	}
	if b.Featured && !reflect.DeepEqual(a.SkipVoters, b.SkipVoters) {
		emit("featured:skip_votes", map[string]any{"count": len(b.SkipVoters), "required": 2, "votedUserIds": skipIDs(b)})
	}
	if b.Status == "closing" && a.Status != "closing" {
		emit("room:closing", map[string]any{"reason": "Featured session ending", "closingAt": ms(b.Deadline)})
	}
	if b.Status == "closed" && a.Status != "closed" {
		emit("room:closed", map[string]string{"reason": "Room closed"})
	}
	return out
}
