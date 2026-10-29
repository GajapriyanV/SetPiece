package realtime

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

func TestQueueBytesAndReceiptMemoryAreBounded(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	c := &client{ctx: ctx, cancel: cancel, out: make(chan []byte, 64)}
	for i := 0; i < 4; i++ {
		c.send(Envelope{Type: "chat:message", Data: strings.Repeat("x", 100<<10)})
	}
	if ctx.Err() == nil || c.queuedBytes > 256<<10 || len(c.out) > 2 {
		t.Fatal("byte budget not enforced")
	}
	ctx, cancel = context.WithCancel(context.Background())
	defer cancel()
	c = &client{ctx: ctx, cancel: cancel, out: make(chan []byte, 64), cache: map[string]cachedReply{}}
	h := &Hub{}
	for i := 0; i < 30; i++ {
		cmd := command{Version: 1, Type: "room:leave", RequestID: fmt.Sprint(i), Data: json.RawMessage("{}")}
		h.command(c, cmd, strings.Repeat(" ", 16<<10))
	}
	if c.cacheBytes > 128<<10 || len(c.cache) > 8 || len(c.cache) == 0 {
		t.Fatal("receipt memory unbounded")
	}
	// A repeated identity with a changed payload cannot run a second mutation.
	h.command(c, command{Version: 1, Type: "room:leave", RequestID: "29", Data: json.RawMessage("{}")}, "different")
	var last Envelope
	for len(c.out) > 0 {
		_ = json.Unmarshal(<-c.out, &last)
	}
	if last.Type != "room:error" {
		t.Fatal("conflicting retry")
	}
}
