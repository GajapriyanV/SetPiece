package chat

import (
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestHistoryUnicodeAndRetries(t *testing.T) {
	now := time.Now()
	s := New(func() time.Time { return now })
	m, fresh, e := s.Send("room", "u", "User", "one", " "+strings.Repeat("😀", 140)+" ")
	if e != nil || !fresh {
		t.Fatal(e)
	}
	retry, fresh, e := s.Send("room", "u", "User", "one", m.Body)
	if e != nil || fresh || retry.ID != m.ID {
		t.Fatal("retry")
	}
	if _, _, e = s.Send("room", "u", "User", "one", "changed"); !errors.Is(e, ErrConflict) {
		t.Fatal(e)
	}
	if _, _, e = s.Send("room", "u", "User", "two", "x"); !errors.Is(e, ErrRate) {
		t.Fatal(e)
	}
	if _, _, e = s.Send("room", "other", "User", "bad", strings.Repeat("😀", 141)); !errors.Is(e, ErrInvalid) {
		t.Fatal(e)
	}
	if _, _, e = s.Send("room", "other", "User", "blank", " \n "); !errors.Is(e, ErrInvalid) {
		t.Fatal(e)
	}
	for i := 0; i < 250; i++ {
		now = now.Add(time.Second)
		if _, _, e = s.Send("room", "u", "User", fmt.Sprint(i), fmt.Sprint(i)); e != nil {
			t.Fatal(e)
		}
	}
	h := s.History("room")
	if len(h) != 50 || h[0].Body != "200" || h[49].Body != "249" || len(s.rooms["room"].messages) != 200 {
		t.Fatal("history bounds/order")
	}
	now = now.Add(46 * time.Minute)
	if len(s.History("room")) != 0 || len(s.last) != 0 {
		t.Fatal("idle eviction")
	}
}
func TestConcurrentFirstMessageAndRoomBounds(t *testing.T) {
	s := New(nil)
	var wg sync.WaitGroup
	for i := 0; i < 30; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); _, _, _ = s.Send("r", "u", "User", "same", "hello") }()
	}
	wg.Wait()
	if len(s.History("r")) != 1 {
		t.Fatal("duplicate message")
	}
	for i := 0; i < 127; i++ {
		_, _, e := s.Send(fmt.Sprint(i), fmt.Sprint(i), "User", "id", "x")
		if e != nil {
			t.Fatal(e)
		}
	}
	if _, _, e := s.Send("overflow", "new", "User", "id", "x"); !errors.Is(e, ErrCapacity) {
		t.Fatal(e)
	}
	s.Forget("r")
	if len(s.History("r")) != 0 {
		t.Fatal("forget")
	}
}
