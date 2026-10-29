package realtime

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"regexp"
)

const ProtocolVersion = 1

// Revision belongs to the committed room state; sequence orders every message
// on one connection. Full snapshots may jump revisions after coalesced commits.
type Envelope struct {
	Version   int    `json:"v"`
	Type      string `json:"type"`
	RequestID string `json:"requestId,omitempty"`
	RoomID    string `json:"roomId,omitempty"`
	Revision  int64  `json:"revision,omitempty"`
	Sequence  uint64 `json:"sequence,omitempty"`
	Data      any    `json:"data"`
}
type command struct {
	Version   int             `json:"v"`
	Type      string          `json:"type"`
	RequestID string          `json:"requestId"`
	Data      json.RawMessage `json:"data"`
}

var requestPattern = regexp.MustCompile("^[A-Za-z0-9_-]{1,64}$")
var roomPattern = regexp.MustCompile("^[a-f0-9]{8}$")
var Commands = []string{"room:create", "room:create_featured", "room:join", "room:leave", "room:state", "side:pick", "side:unpick", "side:ready", "chat:send", "vote:cast", "featured:vote_skip"}
var Events = []string{"room:joined", "room:created", "room:error", "room:member_joined", "room:member_left", "room:state_sync", "room:closed", "room:closing", "side:updated", "side:ready_updated", "debate:starting", "debate:phase_change", "debate:ended", "debate:cancelled", "debate:debater_disconnected", "debate:debater_reconnected", "vote:window_open", "vote:window_closed", "vote:count_update", "results:final", "chat:message", "topic:change", "featured:topic_reveal", "featured:topic_skipped", "featured:debate_complete", "featured:side_pick_started", "featured:debater_disconnected", "featured:debate_cancelled", "featured:skip_votes"}

func decode(data []byte, out any) error {
	d := json.NewDecoder(bytes.NewReader(data))
	d.DisallowUnknownFields()
	if e := d.Decode(out); e != nil {
		return e
	}
	if d.Decode(new(any)) != io.EOF {
		return errors.New("trailing JSON")
	}
	return nil
}
func parse(data []byte) (command, error) {
	var c command
	if !json.Valid(data) || decode(data, &c) != nil || c.Version != 1 || !requestPattern.MatchString(c.RequestID) || len(c.Data) == 0 || c.Data[0] != '{' {
		return c, errors.New("invalid envelope")
	}
	for _, name := range Commands {
		if name == c.Type {
			return c, nil
		}
	}
	return c, errors.New("unknown command")
}
