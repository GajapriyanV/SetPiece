"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { RoomTransport } from "@/lib/realtime/client";
import { goHTTPURL, goWSURL } from "@/lib/realtime/config";
import { initialState, snapshotState, uniqueChat, type Snapshot } from "@/lib/realtime/state";
import type { ChatMessage, Side } from "@/types/socket";

export function useGoRoom(roomId: string, enabled: boolean) {
  const [state, setState] = useState(initialState);
  const [error, setError] = useState<string | null>(null);
  const transport = useRef<RoomTransport | null>(null);
  const latest = useRef(state);
  useEffect(() => { latest.current = state; }, [state]);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    const supabase = createClient();
    const client = new RoomTransport({
      baseURL: goHTTPURL, websocketURL: goWSURL,
      getAccessToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
      onStatus(status) {
        if (disposed) return;
        if (status === "signed_out") setError("Please sign in again");
        setState(previous => ({ ...previous, connectionNotice: status === "connected" ? null : "Reconnecting to room…" }));
      },
      onEvent(event) {
        if (disposed) return;
        if (event.type === "room:joined" || event.type === "room:state_sync") {
          const snapshot = event.data?.state as Snapshot;
          if (!snapshot || snapshot.roomId !== roomId) return;
          setState(previous => ({ ...snapshotState(snapshot), debateCancelled: previous.debateCancelled })); setError(null);
        } else if (event.type === "chat:message") {
          setState(previous => ({ ...previous, chat: uniqueChat([...previous.chat, event.data as unknown as ChatMessage]) }));
        } else if (event.type === "room:closed") {
          setState(previous => ({ ...previous, closed: true, closedReason: String(event.data?.reason ?? "Room closed") }));
          client.stop();
        } else if (event.type === "debate:cancelled") {
          setState(previous => ({ ...previous, debateCancelled: { reason: String(event.data?.reason ?? "Debate cancelled"), username: String(event.data?.username ?? "") } }));
        } else if (event.type === "room:error") {
          const message = String(event.data?.message ?? "Command rejected");
          if (latest.current.roomId !== roomId) setError(message);
          else setState(previous => ({ ...previous, actionError: message }));
        }
      },
    });
    transport.current = client;
    void client.join(roomId).then(() => { if (!disposed) { setState(initialState); setError(null); client.start(); } }).catch(() => { if (!disposed) setError("Invalid room"); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === "SIGNED_OUT") client.signOut();
    });
    const timer = setInterval(() => setState(previous => previous.countdownEndsAt
      ? { ...previous, countdown: Math.max(0, Math.ceil((previous.countdownEndsAt - Date.now()) / 1000)) } : previous), 250);
    return () => {
      disposed = true;
      clearInterval(timer); subscription.unsubscribe();
      transport.current = null;
      // Route disposal is deliberate leave. Offline leave is never buffered.
      void client.leave().catch(() => {}).finally(() => client.stop());
    };
  }, [enabled, roomId]);
  const command = useCallback((type: string, data: Record<string, unknown>) => {
    const client = transport.current;
    if (!client) return;
    setState(previous => ({ ...previous, actionError: null }));
    void client.send(type, data).catch(e => {
      if (transport.current === client) setState(previous => ({ ...previous, actionError: e instanceof Error ? e.message : "Command rejected" }));
    });
  }, []);
  return {
    state: state.roomId === roomId ? state : initialState,
    actions: {
      pickSide: (side: Side) => command("side:pick", { side, revision: latest.current.revision }),
      unpickSide: () => command("side:unpick", { revision: latest.current.revision }),
      setReady: () => command("side:ready", { revision: latest.current.revision }),
      castVote: (side: Side) => command("vote:cast", { side, debateId: latest.current.debateId }),
      sendChat: (body: string) => command("chat:send", { body }),
      voteSkip: () => command("featured:vote_skip", { revision: latest.current.revision }),
      leaveRoom: () => { void transport.current?.leave().catch(() => {}); },
    },
    isLoading: enabled && state.roomId !== roomId && !error,
    error,
  };
}
