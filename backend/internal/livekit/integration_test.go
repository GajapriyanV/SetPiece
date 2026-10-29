package livekit

import (
	"context"
	"github.com/GajapriyanV/SetPiece/backend/internal/auth"
	"github.com/GajapriyanV/SetPiece/backend/internal/debates"
	lk "github.com/livekit/protocol/livekit"
	lksdk "github.com/livekit/server-sdk-go/v2"
	"github.com/pion/webrtc/v4"
	"github.com/pion/webrtc/v4/pkg/media"
	"os"
	"testing"
	"time"
)

func eventually(t *testing.T, fn func() bool) {
	t.Helper()
	deadline := time.Now().Add(8 * time.Second)
	for time.Now().Before(deadline) {
		if fn() {
			return
		}
		time.Sleep(40 * time.Millisecond)
	}
	t.Fatal("timed out waiting for media state")
}

// No .env loading or remote target is permitted. devkey/secret are LiveKit's public dev defaults.
func TestLocalLiveKitThreeParticipants(t *testing.T) {
	url := os.Getenv("SETPIECE_LIVEKIT_TEST_URL")
	if url == "" {
		t.Skip("isolated local LiveKit not configured")
	}
	if url != "ws://127.0.0.1:7880" {
		t.Fatal("integration target must be isolated loopback LiveKit")
	}
	store := fixtureStore()
	store.room.ID = "sp-media-test-" + time.Now().Format("150405.000000")
	id := store.room.ID
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	s := New(store, url, "devkey", "secret")
	api := lksdk.NewRoomServiceClient(url, "devkey", "secret")
	defer func() { _, _ = api.DeleteRoom(context.Background(), &lk.DeleteRoomRequest{Room: id}) }()
	heard := make(chan string, 32)
	clients := map[string]*lksdk.Room{}
	tokens := map[string]string{}
	for _, user := range []string{"a", "b", "c"} {
		token, e := s.Issue(ctx, id, auth.Identity{ID: user, ExpiresAt: time.Now().Add(time.Hour)})
		if e != nil {
			t.Fatal(e)
		}
		tokens[user] = token.Token
		who := user
		client, e := lksdk.ConnectToRoomWithToken(url, token.Token, &lksdk.RoomCallback{ParticipantCallback: lksdk.ParticipantCallback{
			OnTrackSubscribed: func(track *webrtc.TrackRemote, _ *lksdk.RemoteTrackPublication, p *lksdk.RemoteParticipant) {
				go func() {
					if _, _, e := track.ReadRTP(); e == nil {
						select {
						case heard <- who + ":" + p.Identity():
						default:
						}
					}
				}()
			},
		}})
		if e != nil {
			t.Fatal(e)
		}
		defer client.Disconnect()
		clients[user] = client
	}
	if e := s.Ensure(ctx, id, 1); e != nil {
		t.Fatal(e)
	}
	eventually(t, func() bool {
		return clients["a"].LocalParticipant.Permissions().GetCanPublish() && clients["c"].LocalParticipant.Permissions().GetCanSubscribe()
	})
	if clients["b"].LocalParticipant.Permissions().GetCanPublish() || clients["c"].LocalParticipant.Permissions().GetCanPublish() {
		t.Fatal("audience published")
	}
	publish := func(user string) {
		t.Helper()
		track, e := lksdk.NewLocalTrack(webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeOpus, ClockRate: 48000, Channels: 2})
		if e != nil {
			t.Fatal(e)
		}
		defer track.Close()
		_, e = clients[user].LocalParticipant.PublishTrack(track, &lksdk.TrackPublicationOptions{Name: "test-audio", Source: lk.TrackSource_MICROPHONE})
		if e != nil {
			t.Fatal(e)
		}
		ticker := time.NewTicker(20 * time.Millisecond)
		defer ticker.Stop()
		deadline := time.NewTimer(8 * time.Second)
		defer deadline.Stop()
		for {
			select {
			case <-ticker.C:
				_ = track.WriteSample(media.Sample{Data: []byte{0xf8, 0xff, 0xfe}, Duration: 20 * time.Millisecond}, nil)
			case got := <-heard:
				if got == "c:"+user {
					return
				}
			case <-deadline.C:
				t.Fatal("audience did not receive Opus RTP")
			}
		}
	}
	publish("a")
	for phase := 1; phase < 6; phase++ {
		store.change(func(r *debates.Room) { r.PhaseIndex = phase })
		if e := s.Ensure(ctx, id, int64(phase+1)); e != nil {
			t.Fatal(e)
		}
		active := "a"
		inactive := "b"
		if phase%2 == 1 {
			active, inactive = inactive, active
		}
		eventually(t, func() bool {
			return clients[active].LocalParticipant.Permissions().GetCanPublish() && !clients[inactive].LocalParticipant.Permissions().GetCanPublish()
		})
		if phase == 1 {
			publish("b")
		}
	}
	// Rejoining with the original no-permission JWT cannot restore an old speaker grant.
	clients["a"].Disconnect()
	again, e := lksdk.ConnectToRoomWithToken(url, tokens["a"], nil)
	if e != nil {
		t.Fatal(e)
	}
	defer again.Disconnect()
	if again.LocalParticipant.Permissions().GetCanPublish() {
		t.Fatal("old token restored publish")
	}
	if e = s.Ensure(ctx, id, 6); e != nil {
		t.Fatal(e)
	}
	store.change(func(r *debates.Room) { r.Status = "voting" })
	if e = s.Ensure(ctx, id, 7); e != nil {
		t.Fatal(e)
	}
	eventually(t, func() bool { return !clients["b"].LocalParticipant.Permissions().GetCanPublish() })
	// Expired Supabase lease removes the participant even with a connected media session.
	store.change(func(r *debates.Room) { delete(r.Members, "c") })
	if e = s.Ensure(ctx, id, 8); e != nil {
		t.Fatal(e)
	}
	list, e := api.ListParticipants(ctx, &lk.ListParticipantsRequest{Room: id})
	if e != nil {
		t.Fatal(e)
	}
	for _, p := range list.Participants {
		if p.Identity == "c" {
			t.Fatal("departed audience retained media")
		}
	}
	store.change(func(r *debates.Room) { r.Status = "closed" })
	if e = s.Ensure(ctx, id, 9); e != nil {
		t.Fatal(e)
	}
	rooms, e := api.ListRooms(ctx, &lk.ListRoomsRequest{Names: []string{id}})
	if e != nil || len(rooms.Rooms) != 0 {
		t.Fatal("closed media room retained")
	}
}
