"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { connectSocket, getSocket, type AppSocket } from "@/lib/socket";

export function useSocket(enabled = true) {
  const [socket, setSocket] = useState<AppSocket | null>(getSocket);
  const [isConnected, setIsConnected] = useState(getSocket()?.connected ?? false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let removeListeners = () => {};
    const supabase = createClient();
    async function connect() {
      const { data: { session } } = await supabase.auth.getSession();
      if (disposed) return;
      if (!session?.access_token) { setError("Not authenticated"); return; }
      const s = connectSocket(session.access_token);
      const onConnect = () => { if (!disposed) { setIsConnected(true); setError(null); } };
      const onDisconnect = () => { if (!disposed) setIsConnected(false); };
      const onConnectError = async (err: Error) => {
        const { data: { session: refreshed } } = await supabase.auth.getSession();
        if (disposed) return;
        if (refreshed?.access_token) { s.auth = { token: refreshed.access_token }; s.connect(); }
        else setError(err.message);
      };
      s.on("connect", onConnect); s.on("disconnect", onDisconnect); s.on("connect_error", onConnectError);
      removeListeners = () => { s.off("connect", onConnect); s.off("disconnect", onDisconnect); s.off("connect_error", onConnectError); };
      setSocket(s); setIsConnected(s.connected);
    }
    void connect().catch(() => { if (!disposed) setError("Unable to connect"); });
    // The legacy singleton persists; only this hook's listeners are removed.
    return () => { disposed = true; removeListeners(); };
  }, [enabled]);
  return { socket, isConnected, error };
}
