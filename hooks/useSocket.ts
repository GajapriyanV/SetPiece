"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { connectSocket, getSocket, type AppSocket } from "@/lib/socket";

export function useSocket() {
  const [socket, setSocket] = useState<AppSocket | null>(getSocket);
  const [isConnected, setIsConnected] = useState(getSocket()?.connected ?? false);
  const [error, setError] = useState<string | null>(null);
  const connectingRef = useRef(false);

  useEffect(() => {
    // If already connected, just sync state
    const existing = getSocket();
    if (existing?.connected) {
      setSocket(existing);
      setIsConnected(true);
      return;
    }

    if (connectingRef.current) return;
    connectingRef.current = true;

    const supabase = createClient();

    async function connect() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Not authenticated");
        connectingRef.current = false;
        return;
      }

      const s = connectSocket(session.access_token);

      function onConnect() {
        setIsConnected(true);
        setError(null);
      }

      function onDisconnect() {
        setIsConnected(false);
      }

      async function onConnectError(err: Error) {
        const { data: { session: refreshed } } = await supabase.auth.getSession();
        if (refreshed?.access_token) {
          s.auth = { token: refreshed.access_token };
          s.connect();
        } else {
          setError(err.message);
        }
      }

      // Remove previous listeners to avoid duplicates, then add
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.on("connect", onConnect);
      s.on("disconnect", onDisconnect);
      s.on("connect_error", onConnectError);

      if (s.connected) {
        setIsConnected(true);
      }

      setSocket(s);
      connectingRef.current = false;
    }

    connect();

    // Don't disconnect on unmount — socket persists across page navigations
  }, []);

  return { socket, isConnected, error };
}
