"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Room, RoomEvent, ConnectionState, DefaultReconnectPolicy, Track } from "livekit-client";
import { createClient } from "@/utils/supabase/client";
import { roomTarget } from "@/lib/realtime/config";

export function useLiveKit(routeId: string | null) {
  const roomRef = useRef<Room | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState<Record<string, boolean>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [canPublish, setCanPublish] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  useEffect(() => {
    if (!routeId) return;
    const target = roomTarget(routeId);
    const supabase = createClient();
    const room = new Room({ reconnectPolicy: new DefaultReconnectPolicy() });
    roomRef.current = room;
    const controller = new AbortController();
    let disposed = false;
    let syncing = false;
    const tracks = new Set<{ detach: () => HTMLMediaElement[] }>();
    function cleanupAudio() {
      tracks.forEach(track => track.detach().forEach(el => el.remove()));
      tracks.clear();
    }
    function mute() {
      setCanPublish(false); setMicEnabled(false);
      void room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
    }
    async function request(path: string, method = "GET") {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || disposed) throw new Error("Sign in to connect audio");
      const response = await fetch(target.baseURL.replace(/\/$/, "") + path + "?roomId=" + encodeURIComponent(target.id), {
        method, headers: { Authorization: "Bearer " + session.access_token },
        cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
      });
      if (!response.ok) throw new Error("Audio permissions unavailable");
      return response.json();
    }
    function attach(track: { attach: () => HTMLMediaElement; detach: () => HTMLMediaElement[] }) {
      if (tracks.has(track) || disposed) return;
      tracks.add(track);
      const element = track.attach();
      element.autoplay = true;
      document.body.appendChild(element);
    }
    async function sync() {
      if (syncing || disposed || room.state !== ConnectionState.Connected) return;
      syncing = true;
      try {
        const data = await request("/api/livekit/sync", target.backend === "go" ? "POST" : "GET");
        if (disposed) return;
        setCanPublish(!!data.canPublish && !!room.localParticipant.permissions?.canPublish);
        if (!data.canPublish) mute();
        setMediaError(null);
      } catch {
        if (!disposed) { mute(); setMediaError("Audio permission check failed. Retrying…"); }
      } finally { syncing = false; }
    }
    room.on(RoomEvent.TrackSubscribed, track => { if (track.kind === Track.Kind.Audio) attach(track); });
    room.on(RoomEvent.TrackUnsubscribed, track => {
      track.detach().forEach(el => el.remove()); tracks.delete(track);
    });
    room.on(RoomEvent.ParticipantPermissionsChanged, (_previous, participant) => {
      if (disposed || !participant.isLocal) return;
      if (!participant.permissions?.canPublish) mute();
      else void sync();
    });
    room.on(RoomEvent.AudioPlaybackStatusChanged, () => { if (!disposed) setNeedsAudioUnlock(!room.canPlaybackAudio); });
    room.on(RoomEvent.ActiveSpeakersChanged, speakers => {
      if (!disposed) setIsSpeaking(Object.fromEntries(speakers.map(p => [p.identity, true])));
    });
    room.on(RoomEvent.Connected, () => {
      if (disposed) return;
      setIsConnected(true); setIsReconnecting(false); setNeedsAudioUnlock(!room.canPlaybackAudio);
    });
    room.on(RoomEvent.Reconnecting, () => {
      if (disposed) return;
      mute(); setIsReconnecting(true); setIsSpeaking({});
    });
    room.on(RoomEvent.Reconnected, () => {
      if (disposed) return;
      setIsReconnecting(false); setIsConnected(true); void sync();
    });
    room.on(RoomEvent.Disconnected, () => {
      cleanupAudio();
      if (disposed) return;
      mute(); setIsConnected(false); setIsReconnecting(false); setIsSpeaking({}); setNeedsAudioUnlock(false);
      setMediaError("Audio disconnected. Reconnect to continue listening.");
    });
    async function connect() {
      try {
        mute(); setMediaError(null);
        const data = await request("/api/livekit/token");
        if (disposed) return;
        const url = target.backend === "go" ? data.url : process.env.NEXT_PUBLIC_LIVEKIT_URL;
        if (!url || !data.token) throw new Error("Audio unavailable");
        await room.connect(url, data.token);
        if (disposed) { await room.disconnect(); return; }
        room.remoteParticipants.forEach(p => p.trackPublications.forEach(pub => {
          if (pub.isSubscribed && pub.track && pub.kind === Track.Kind.Audio) attach(pub.track);
        }));
        await sync();
      } catch {
        if (!disposed) {
          mute(); setIsConnected(false); setMediaError("Unable to connect audio. Please retry.");
          await room.disconnect();
        }
      }
    }
    void connect();
    // Also retries failed reconciliation without minting a new identity/token.
    const timer = setInterval(() => { void sync(); }, 3000);
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === "SIGNED_OUT") {
        controller.abort(); mute(); void room.disconnect();
      }
    });
    return () => {
      disposed = true; controller.abort(); clearInterval(timer); subscription.unsubscribe();
      cleanupAudio(); void room.disconnect();
      if (roomRef.current === room) roomRef.current = null;
    };
  }, [routeId, attempt]);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room || !canPublish || !room.localParticipant.permissions?.canPublish || room.state !== ConnectionState.Connected) return;
    try {
      await room.startAudio();
      const next = !room.localParticipant.isMicrophoneEnabled;
      await room.localParticipant.setMicrophoneEnabled(next);
      if (roomRef.current === room) setMicEnabled(room.localParticipant.isMicrophoneEnabled);
    } catch { setMediaError("Microphone unavailable. Check browser permission and try again."); }
  }, [canPublish]);
  const unlockAudio = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try { await room.startAudio(); setNeedsAudioUnlock(!room.canPlaybackAudio); }
    catch { setMediaError("Tap again to enable browser audio."); }
  }, []);
  const retryAudio = useCallback(() => setAttempt(previous => previous + 1), []);
  return { isSpeaking, isConnected, isReconnecting, canPublish, micEnabled, needsAudioUnlock, mediaError, retryAudio, toggleMic, unlockAudio };
}
