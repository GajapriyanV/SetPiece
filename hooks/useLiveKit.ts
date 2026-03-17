"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Room, RoomEvent, ConnectionState, DefaultReconnectPolicy, Track } from "livekit-client";
import { createClient } from "@/utils/supabase/client";

export function useLiveKit(roomId: string | null) {
  const roomRef = useRef<Room | null>(null);
  const micEnabledRef = useRef(false);
  const [isSpeaking, setIsSpeaking] = useState<Record<string, boolean>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [canPublish, setCanPublish] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false);

  useEffect(() => {
    if (!roomId) return;

    // Abort flag: prevents the stale StrictMode effect invocation from
    // completing its async connect() after cleanup has already run.
    let aborted = false;

    const room = new Room({
      reconnectPolicy: new DefaultReconnectPolicy(),
    });
    roomRef.current = room;

    function attachAudio(track: { attach: () => HTMLAudioElement }) {
      const el = track.attach();
      el.setAttribute("data-lk", "true");
      el.autoplay = true;
      document.body.appendChild(el);
    }

    function cleanupAudio() {
      document.querySelectorAll("[data-lk]").forEach((el) => el.remove());
    }

    async function connect() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || aborted) return;

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SOCKET_URL}/api/livekit/token?roomId=${roomId}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      if (!res.ok || aborted) return;

      const { token } = await res.json();
      if (aborted) return;

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) attachAudio(track);
      });

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) track.detach().forEach((el) => el.remove());
      });

      // v2 event signature: (prevPermissions, participant)
      room.on(RoomEvent.ParticipantPermissionsChanged, (_prev, participant) => {
        if (participant.isLocal) {
          const allowed = !!participant.permissions?.canPublish;
          setCanPublish(allowed);
          if (!allowed) {
            room.localParticipant.setMicrophoneEnabled(false);
            micEnabledRef.current = false;
            setMicEnabled(false);
          }
        }
      });

      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        setNeedsAudioUnlock(!room.canPlaybackAudio);
      });

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const map: Record<string, boolean> = {};
        speakers.forEach((p) => { map[p.identity] = true; });
        setIsSpeaking(map);
      });

      room.on(RoomEvent.Connected, () => {
        setIsConnected(true);
        setIsReconnecting(false);
        setNeedsAudioUnlock(!room.canPlaybackAudio);
        setCanPublish(!!room.localParticipant.permissions?.canPublish);
      });

      room.on(RoomEvent.Reconnecting, () => {
        setIsReconnecting(true);
      });

      // After reconnect, re-sync permissions with server. LiveKit replays the
      // original JWT on reconnect which can reset canPublish to the value it
      // had at token-generation time (e.g. false if they joined during lobby).
      room.on(RoomEvent.Reconnected, async () => {
        setIsReconnecting(false);
        setIsConnected(true);

        let allowed = !!room.localParticipant.permissions?.canPublish;

        try {
          const supabase = createClient();
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            const res = await fetch(
              `${process.env.NEXT_PUBLIC_SOCKET_URL}/api/livekit/sync?roomId=${roomId}`,
              { headers: { Authorization: `Bearer ${session.access_token}` } }
            );
            if (res.ok) {
              const data = await res.json();
              allowed = !!data.canPublish;
            }
          }
        } catch { /* fall back to current permission state */ }

        setCanPublish(allowed);
        if (allowed && micEnabledRef.current) {
          try {
            await room.localParticipant.setMicrophoneEnabled(true);
          } catch {
            micEnabledRef.current = false;
            setMicEnabled(false);
          }
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        setIsConnected(false);
        setIsReconnecting(false);
        setIsSpeaking({});
        micEnabledRef.current = false;
        setMicEnabled(false);
        setNeedsAudioUnlock(false);
        cleanupAudio();
      });

      await room.connect(process.env.NEXT_PUBLIC_LIVEKIT_URL!, token);
      if (aborted) {
        room.disconnect();
        return;
      }

      setCanPublish(!!room.localParticipant.permissions?.canPublish);

      // Attach tracks from participants already in the room
      room.remoteParticipants.forEach((participant) => {
        participant.trackPublications.forEach((pub) => {
          if (pub.isSubscribed && pub.track && pub.kind === Track.Kind.Audio) {
            try { attachAudio(pub.track); } catch { /* participant may have left */ }
          }
        });
      });
    }

    connect();

    return () => {
      aborted = true;
      cleanupAudio();
      room.disconnect();
      roomRef.current = null;
    };
  }, [roomId]);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room || !canPublish) return;
    if (room.state !== ConnectionState.Connected) return;
    await room.startAudio();
    const next = !micEnabled;
    await room.localParticipant.setMicrophoneEnabled(next);
    micEnabledRef.current = next;
    setMicEnabled(next);
  }, [canPublish, micEnabled]);

  const unlockAudio = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    await room.startAudio();
    setNeedsAudioUnlock(!room.canPlaybackAudio);
  }, []);

  return { isSpeaking, isConnected, isReconnecting, canPublish, micEnabled, needsAudioUnlock, toggleMic, unlockAudio };
}
