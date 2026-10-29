package realtime

import (
	"encoding/json"
	"github.com/GajapriyanV/SetPiece/backend/internal/chat"
	"github.com/GajapriyanV/SetPiece/backend/internal/debates"
	"github.com/GajapriyanV/SetPiece/backend/internal/voting"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
	"time"
)

func TestBaselineEventMaps(t *testing.T) {
	for _, file := range []string{filepath.Join("..", "..", "..", "types", "socket.ts"), filepath.Join("..", "..", "..", "server", "src", "types", "events.ts")} {
		text, e := os.ReadFile(file)
		if e != nil {
			t.Fatal(e)
		}
		source := string(text)
		for _, contract := range []struct {
			marker string
			names  []string
		}{{"export interface ClientToServerEvents", Commands}, {"export interface ServerToClientEvents", Events}} {
			at := strings.Index(source, contract.marker)
			if at < 0 {
				t.Fatal("missing interface", file)
			}
			body := source[at:]
			if next := strings.Index(body[1:], "export interface"); next >= 0 {
				body = body[:next+1]
			}
			matches := regexp.MustCompile(`"([a-z_]+:[a-z_]+)"`).FindAllStringSubmatch(body, -1)
			actual := []string{}
			for _, m := range matches {
				actual = append(actual, m[1])
			}
			expected := append([]string(nil), contract.names...)
			sort.Strings(actual)
			sort.Strings(expected)
			if strings.Join(actual, ",") != strings.Join(expected, ",") {
				t.Fatalf("contract drift %s: %v", file, actual)
			}
		}
	}
	if len(Commands) != 11 || len(Events) != 29 {
		t.Fatal("baseline event count")
	}
}
func TestTransitionPayloadCoverage(t *testing.T) {
	now := time.Now()
	deadline := now.Add(30 * time.Second)
	base := func() View {
		return View{Room: debates.Room{ID: "12345678", Revision: 2, Featured: true, Status: "lobby", Topics: []debates.Topic{{Topic: "First", SideA: "A", SideB: "B"}, {Topic: "Next", SideA: "A", SideB: "B"}}, Members: map[string]debates.Member{}, SkipVoters: map[string]bool{}}, Profiles: map[string]Brief{"a": {UserID: "a", Username: "Alice"}, "b": {UserID: "b", Username: "Bob"}}, OwnVotes: map[string]string{}}
	}
	seen := map[string]bool{}
	apply := func(before, after View) {
		for _, event := range changes(before, after, now) {
			seen[event.Type] = true
			if event.Type == "featured:topic_reveal" && event.Data.(map[string]any)["sidePickEndsAt"] == nil {
				t.Fatal("legacy event requires zero for absent deadline")
			}
			if event.RoomID != "12345678" || event.Revision != after.Room.Revision {
				t.Fatal("revision metadata")
			}
			if _, e := json.Marshal(event); e != nil {
				t.Fatal(e)
			}
		}
	}
	a, b := base(), base()
	b.Room.Members["a"] = debates.Member{UserID: "a", Side: "a", Ready: true}
	apply(a, b)
	a, b = base(), base()
	a.Room.Members["a"] = debates.Member{UserID: "a"}
	apply(a, b)
	a, b = base(), base()
	a.Room.DebaterA = "a"
	b.Room.DebaterA = "a"
	a.Room.Members["a"] = debates.Member{UserID: "a"}
	b.Room.Members["a"] = debates.Member{UserID: "a", DepartAt: &deadline}
	apply(a, b)
	apply(b, a)
	a, b = base(), base()
	a.Room.Status = "live"
	a.Room.DebateID = "debate"
	a.Room.DebaterA = "a"
	apply(a, b)
	a, b = base(), base()
	b.Room.Status = "countdown"
	b.Room.DebateID = "debate"
	b.Room.Deadline = &deadline
	apply(a, b)
	a = b
	b = base()
	b.Room.Status = "live"
	b.Room.PhaseIndex = 0
	b.Room.Deadline = &deadline
	apply(a, b)
	a = b
	b = base()
	b.Room.Status = "voting"
	b.Room.Deadline = &deadline
	apply(a, b)
	a = b
	b = base()
	b.Room.Status = "results"
	b.VotesA = 1
	b.Result = &voting.Result{FinishedAt: now}
	apply(a, b)
	a, b = base(), base()
	a.Room.Deadline = &now
	b.Room.Deadline = &deadline
	b.Room.TopicIndex = 1
	b.Room.SkipVoters["a"] = true
	apply(a, b)
	a, b = base(), base()
	a.Room.Status = "results"
	b.Room.Completed = 1
	apply(a, b)
	a, b = base(), base()
	b.Room.Status = "closing"
	b.Room.Deadline = &deadline
	apply(a, b)
	a = b
	b = base()
	b.Room.Status = "closed"
	apply(a, b)
	direct := map[string]bool{"room:joined": true, "room:created": true, "room:error": true, "room:state_sync": true, "chat:message": true}
	for _, name := range Events {
		if !seen[name] && !direct[name] {
			t.Errorf("missing transition coverage %s", name)
		}
	}
}
func TestRecoverySnapshots(t *testing.T) {
	now := time.Now()
	deadline := now.Add(30 * time.Second)
	for _, status := range []string{"lobby", "countdown", "live", "voting", "awaiting_result", "results", "closing"} {
		t.Run(status, func(t *testing.T) {
			v := View{Room: debates.Room{ID: "12345678", Revision: 17, Featured: true, Topics: []debates.Topic{{Topic: "Question", SideA: "Yes", SideB: "No"}}, Members: map[string]debates.Member{"u": {UserID: "u", Side: "a", Ready: true, JoinedAt: now}}, SkipVoters: map[string]bool{"u": true}, Status: status, PhaseIndex: 0, Deadline: &deadline, DebateID: "debate", DebaterA: "u"}, Profiles: map[string]Brief{"u": {UserID: "u", Username: "User"}}, OwnVotes: map[string]string{"u": "a"}, VotesA: 3, Result: &voting.Result{VotesA: 3}}
			snapshot := v.snapshot("u", []chat.Message{}, now)
			for _, key := range []string{"revision", "serverTime", "members", "debaterA", "debaterB", "phase", "chat", "debateId", "votes", "ownVote", "results", "featuredMeta", "countdownEndsAt", "votingEndsAt", "sidePickEndsAt", "closingAt", "skipVotes", "recoveryEndsAt", "deadline"} {
				if _, ok := snapshot[key]; !ok {
					t.Error("missing", key)
				}
			}
			if snapshot["revision"] != int64(17) || snapshot["ownVote"] != "a" {
				t.Fatal("snapshot receipt")
			}
			if v.snapshot("other", nil, now)["ownVote"] != nil {
				t.Fatal("vote leakage")
			}
			if status == "countdown" && snapshot["countdownEndsAt"] == nil || status == "live" && snapshot["phase"] == nil || status == "voting" && snapshot["votingEndsAt"] == nil || status == "lobby" && snapshot["sidePickEndsAt"] == nil || status == "closing" && snapshot["closingAt"] == nil {
				t.Fatal("deadline missing")
			}
		})
	}
}
