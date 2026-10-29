package chat

import (
	"errors"
	"fmt"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestCrossRoomRateAndCapacityRecovery(t *testing.T) {
	now := time.Unix(1, 0)
	s := New(func() time.Time { return now })
	if _, _, e := s.Send("one", "same", "User", "first", "hello"); e != nil {
		t.Fatal(e)
	}
	if _, _, e := s.Send("two", "same", "User", "second", "hello"); !errors.Is(e, ErrRate) {
		t.Fatal("room switching bypassed user limit", e)
	}
	s.Forget("one")
	if _, _, e := s.Send("two", "same", "User", "third", "hello"); !errors.Is(e, ErrRate) {
		t.Fatal("forget bypassed user limit", e)
	}
	now = now.Add(time.Second)
	for i := 0; i < 4096; i++ {
		if _, _, e := s.Send("two", fmt.Sprint(i), "User", "id", "hello"); e != nil {
			t.Fatal(e)
		}
	}
	if _, _, e := s.Send("two", "overflow", "User", "id", "hello"); !errors.Is(e, ErrCapacity) {
		t.Fatal("user budget", e)
	}
	now = now.Add(time.Second)
	if _, _, e := s.Send("two", "overflow", "User", "id", "hello"); e != nil {
		t.Fatal("expired limits not reclaimed", e)
	}
}

func TestChatMemoryEnvelope(t *testing.T) {
	if testing.Short() {
		t.Skip("bounded memory measurement")
	}
	runtime.GC()
	var start, full, empty runtime.MemStats
	runtime.ReadMemStats(&start)
	now := time.Unix(1, 0)
	s := New(func() time.Time { return now })
	for n := 0; n < 200; n++ {
		for room := 0; room < 128; room++ {
			now = now.Add(time.Second)
			if _, _, e := s.Send(fmt.Sprint(room), "fixture-user", strings.Repeat("n", 64), fmt.Sprint(n), fmt.Sprintf("%04d", n)+strings.Repeat("x", 276)); e != nil {
				t.Fatal(e)
			}
		}
	}
	if len(s.rooms) != 128 {
		t.Fatal("room envelope")
	}
	total := 0
	for _, h := range s.rooms {
		total += len(h.messages)
	}
	if total != 25600 {
		t.Fatal("history envelope", total)
	}
	runtime.GC()
	runtime.ReadMemStats(&full)
	runtime.KeepAlive(s)
	now = now.Add(46 * time.Minute)
	s.History("0")
	if len(s.rooms) != 0 || len(s.last) != 0 {
		t.Fatal("idle retention")
	}
	runtime.GC()
	runtime.ReadMemStats(&empty)
	runtime.KeepAlive(s)
	t.Logf("128 rooms x 200 unique 280-byte bodies: retained_heap_delta=%d bytes; after_idle_delta=%d bytes (GC sample, not process RSS)", int64(full.HeapAlloc)-int64(start.HeapAlloc), int64(empty.HeapAlloc)-int64(start.HeapAlloc))
}

func BenchmarkChatSendAtCapacity(b *testing.B) {
	now := time.Unix(1, 0)
	s := New(func() time.Time { return now })
	for i := 0; i < 128; i++ {
		_, _, _ = s.Send(fmt.Sprint(i), fmt.Sprint(i), "User", "seed", "hello")
	}
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		now = now.Add(time.Second)
		if _, _, e := s.Send(fmt.Sprint(i%128), "fixture", "User", fmt.Sprint(i), strings.Repeat("x", 280)); e != nil {
			b.Fatal(e)
		}
	}
}
