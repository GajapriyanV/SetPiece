"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { connectSocket, disconnectSocket, type AppSocket } from "@/lib/socket";

export default function CreateRoomModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const backdropRef = useRef<HTMLDivElement>(null);
  const [topic, setTopic] = useState("");
  const [sideALabel, setSideALabel] = useState("");
  const [sideBLabel, setSideBLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim() || !sideALabel.trim() || !sideBLabel.trim()) {
      setError("All fields are required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Not authenticated — please sign in first");
        setLoading(false);
        return;
      }

      const socket = connectSocket(session.access_token);

      // Wait for connection
      if (!socket.connected) {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            socket.off("connect", onConnect);
            socket.off("connect_error", onError);
            reject(new Error("Connection timeout — is the server running?"));
          }, 8000);

          function onConnect() {
            clearTimeout(timeout);
            socket.off("connect_error", onError);
            resolve();
          }

          function onError(err: Error) {
            clearTimeout(timeout);
            socket.off("connect", onConnect);
            reject(new Error(`Auth failed: ${err.message}`));
          }

          socket.once("connect", onConnect);
          socket.once("connect_error", onError);
        });
      }

      // Listen for room created
      socket.once("room:created", ({ roomId }) => {
        router.push(`/rooms/${roomId}`);
      });

      socket.once("room:error", ({ message }) => {
        setError(message);
        setLoading(false);
      });

      socket.emit("room:create", {
        topic: topic.trim(),
        sideALabel: sideALabel.trim(),
        sideBLabel: sideBLabel.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect to server");
      setLoading(false);
    }
  }

  return (
    <div
      ref={backdropRef}
      onClick={(e) => e.target === backdropRef.current && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "480px",
          background: "var(--card)",
          border: "1px solid var(--border)",
          padding: "36px 32px",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "28px" }}>
          <h2
            style={{
              fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
              fontSize: "24px",
              fontWeight: 700,
              textTransform: "uppercase",
              margin: 0,
              color: "var(--text)",
            }}
          >
            Create Room
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--dim)",
              fontSize: "20px",
              cursor: "pointer",
              padding: "4px",
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Topic */}
          <div>
            <label
              style={{
                display: "block",
                fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                fontSize: "9px",
                letterSpacing: "2px",
                textTransform: "uppercase",
                color: "var(--dim)",
                marginBottom: "8px",
              }}
            >
              Debate Topic
            </label>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Who's The Better Generational Talent?"
              maxLength={120}
              style={{
                width: "100%",
                background: "var(--dark3)",
                border: "1px solid var(--border)",
                padding: "12px 14px",
                fontFamily: "var(--font-body, 'Familjen Grotesk', sans-serif)",
                fontSize: "14px",
                color: "var(--text)",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Sides */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div>
              <label
                style={{
                  display: "block",
                  fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                  fontSize: "9px",
                  letterSpacing: "2px",
                  textTransform: "uppercase",
                  color: "#60a5fa",
                  marginBottom: "8px",
                }}
              >
                Side A
              </label>
              <input
                value={sideALabel}
                onChange={(e) => setSideALabel(e.target.value)}
                placeholder="e.g. Haaland"
                maxLength={40}
                style={{
                  width: "100%",
                  background: "var(--dark3)",
                  border: "1px solid var(--border)",
                  padding: "12px 14px",
                  fontFamily: "var(--font-body, 'Familjen Grotesk', sans-serif)",
                  fontSize: "14px",
                  color: "var(--text)",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                  fontSize: "9px",
                  letterSpacing: "2px",
                  textTransform: "uppercase",
                  color: "#fb923c",
                  marginBottom: "8px",
                }}
              >
                Side B
              </label>
              <input
                value={sideBLabel}
                onChange={(e) => setSideBLabel(e.target.value)}
                placeholder="e.g. Mbappé"
                maxLength={40}
                style={{
                  width: "100%",
                  background: "var(--dark3)",
                  border: "1px solid var(--border)",
                  padding: "12px 14px",
                  fontFamily: "var(--font-body, 'Familjen Grotesk', sans-serif)",
                  fontSize: "14px",
                  color: "var(--text)",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {error && (
            <div
              style={{
                fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                fontSize: "11px",
                color: "var(--red)",
                letterSpacing: "0.5px",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: loading ? "var(--dim)" : "var(--g)",
              border: "none",
              padding: "14px",
              cursor: loading ? "default" : "pointer",
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "3px",
              textTransform: "uppercase",
              color: "var(--dark)",
              transition: "background 0.2s",
            }}
          >
            {loading ? "Creating..." : "Create Room"}
          </button>
        </form>
      </div>
    </div>
  );
}
