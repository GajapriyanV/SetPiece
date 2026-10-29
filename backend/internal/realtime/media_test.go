package realtime

import (
	"context"
	"encoding/json"
	"github.com/GajapriyanV/SetPiece/backend/internal/livekit"
	"github.com/jackc/pgx/v5/pgxpool"
	lk "github.com/livekit/protocol/livekit"
	lksdk "github.com/livekit/server-sdk-go/v2"
	"github.com/pion/webrtc/v4"
	"github.com/pion/webrtc/v4/pkg/media"
	"net/http"
	"os"
	"testing"
	"time"
)

func localMediaService(t *testing.T, pool *pgxpool.Pool) *livekit.Service {
	t.Helper()
	url := os.Getenv("SETPIECE_LIVEKIT_TEST_URL")
	if url == "" {
		return nil
	}
	if url != "ws://127.0.0.1:7880" {
		t.Fatal("media integration requires the isolated loopback dev server")
	}
	return livekit.New(livekit.NewStore(pool), url, "devkey", "secret")
}

type mediaFixture struct {
	ctx           context.Context
	httpURL, room string
	users         []string
	clients       []*lksdk.Room
	heard         chan string
	api           *lksdk.RoomServiceClient
}

func (f *mediaFixture) request(t *testing.T, user, path, method string, result any) {
	t.Helper()
	req, e := http.NewRequestWithContext(f.ctx, method, f.httpURL+path+"?roomId="+f.room, nil)
	if e != nil {
		t.Fatal(e)
	}
	req.Header.Set("Authorization", "Bearer "+user)
	response, e := http.DefaultClient.Do(req)
	if e != nil {
		t.Fatal(e)
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		t.Fatalf("media HTTP status %d", response.StatusCode)
	}
	if e = json.NewDecoder(response.Body).Decode(result); e != nil {
		t.Fatal(e)
	}
}
func connectMediaFixture(t *testing.T, ctx context.Context, httpURL, room string, users []string) *mediaFixture {
	t.Helper()
	f := &mediaFixture{ctx: ctx, httpURL: httpURL, room: room, users: users, heard: make(chan string, 32), api: lksdk.NewRoomServiceClient("ws://127.0.0.1:7880", "devkey", "secret")}
	t.Cleanup(func() {
		for _, client := range f.clients {
			client.Disconnect()
		}
		cleanup, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		_, _ = f.api.DeleteRoom(cleanup, &lk.DeleteRoomRequest{Room: f.room})
	})
	for index, user := range users {
		var token livekit.Token
		f.request(t, user, "/api/livekit/token", "GET", &token)
		if token.CanPublish || token.URL != "ws://127.0.0.1:7880" {
			t.Fatal("unexpected token grants/provider")
		}
		listener := index
		client, e := lksdk.ConnectToRoomWithToken(token.URL, token.Token, &lksdk.RoomCallback{ParticipantCallback: lksdk.ParticipantCallback{
			OnTrackSubscribed: func(track *webrtc.TrackRemote, _ *lksdk.RemoteTrackPublication, p *lksdk.RemoteParticipant) {
				if listener != 2 {
					return
				}
				go func() {
					if _, _, e := track.ReadRTP(); e == nil {
						select {
						case f.heard <- p.Identity():
						default:
						}
					}
				}()
			},
		}})
		if e != nil {
			t.Fatal(e)
		}
		f.clients = append(f.clients, client)
	}
	return f
}
func (f *mediaFixture) phase(t *testing.T, index int) {
	t.Helper()
	for i, user := range f.users {
		var permission livekit.Permission
		f.request(t, user, "/api/livekit/sync", "POST", &permission)
		want := index < 6 && i < 2 && i == index%2
		if permission.CanPublish != want {
			t.Fatalf("HTTP permission mismatch for phase %d", index)
		}
	}
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		valid := true
		for i, client := range f.clients {
			permission := client.LocalParticipant.Permissions()
			want := index < 6 && i < 2 && i == index%2
			if permission.GetCanPublish() != want || !permission.GetCanSubscribe() {
				valid = false
			}
			if want && (len(permission.CanPublishSources) != 1 || permission.CanPublishSources[0] != lk.TrackSource_MICROPHONE) {
				valid = false
			}
		}
		if valid {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("media permissions did not follow committed phase")
}
func (f *mediaFixture) audio(t *testing.T, speaker int) {
	t.Helper()
	track, e := lksdk.NewLocalTrack(webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeOpus, ClockRate: 48000, Channels: 2})
	if e != nil {
		t.Fatal(e)
	}
	defer track.Close()
	_, e = f.clients[speaker].LocalParticipant.PublishTrack(track, &lksdk.TrackPublicationOptions{Name: "fixture-audio", Source: lk.TrackSource_MICROPHONE})
	if e != nil {
		t.Fatal(e)
	}
	ticker := time.NewTicker(20 * time.Millisecond)
	defer ticker.Stop()
	deadline := time.NewTimer(6 * time.Second)
	defer deadline.Stop()
	for {
		select {
		case <-ticker.C:
			_ = track.WriteSample(media.Sample{Data: []byte{0xf8, 0xff, 0xfe}, Duration: 20 * time.Millisecond}, nil)
		case user := <-f.heard:
			if user == f.users[speaker] {
				return
			}
		case <-deadline.C:
			t.Fatal("audience did not receive debate audio")
		}
	}
}
func (f *mediaFixture) deleted(t *testing.T) {
	t.Helper()
	rooms, e := f.api.ListRooms(f.ctx, &lk.ListRoomsRequest{Names: []string{f.room}})
	if e != nil || len(rooms.Rooms) != 0 {
		t.Fatal("media room retained after return to lobby")
	}
}
