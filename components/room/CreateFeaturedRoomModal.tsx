"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { connectSocket } from "@/lib/socket";

interface TopicRow {
  topic: string;
  sideALabel: string;
  sideBLabel: string;
}

const emptyRow = (): TopicRow => ({ topic: "", sideALabel: "", sideBLabel: "" });

export default function CreateFeaturedRoomModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const backdropRef = useRef<HTMLDivElement>(null);
  const [topics, setTopics] = useState<TopicRow[]>([emptyRow()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function updateTopic(index: number, field: keyof TopicRow, value: string) {
    setTopics((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  }

  function addRow() {
    if (topics.length < 15) setTopics((prev) => [...prev, emptyRow()]);
  }

  function removeRow(index: number) {
    if (topics.length > 1) setTopics((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const valid = topics.filter((t) => t.topic.trim() && t.sideALabel.trim() && t.sideBLabel.trim());
    if (valid.length === 0) {
      setError("At least one complete topic is required");
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

      socket.once("room:created", ({ roomId }) => {
        router.push(`/rooms/${roomId}`);
      });

      socket.once("room:error", ({ message }) => {
        setError(message);
        setLoading(false);
      });

      socket.emit("room:create_featured", {
        topics: valid.map((t) => ({
          topic: t.topic.trim(),
          sideALabel: t.sideALabel.trim(),
          sideBLabel: t.sideBLabel.trim(),
        })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect to server");
      setLoading(false);
    }
  }

  const labelStyle = {
    display: "block" as const,
    fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
    fontSize: "9px",
    letterSpacing: "2px",
    textTransform: "uppercase" as const,
    color: "var(--dim)",
    marginBottom: "6px",
  };

  const inputStyle = {
    width: "100%",
    background: "var(--dark3)",
    border: "1px solid var(--border)",
    padding: "10px 12px",
    fontFamily: "var(--font-body, 'Familjen Grotesk', sans-serif)",
    fontSize: "13px",
    color: "var(--text)",
    outline: "none",
    boxSizing: "border-box" as const,
  };

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
          maxWidth: "640px",
          maxHeight: "85vh",
          overflow: "auto",
          background: "var(--card)",
          border: "1px solid var(--border)",
          padding: "36px 32px",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
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
            Featured Room
          </h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--dim)", fontSize: "20px", cursor: "pointer", padding: "4px" }}
          >
            ✕
          </button>
        </div>

        <p
          style={{
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "10px",
            letterSpacing: "1px",
            color: "var(--dim)",
            margin: "0 0 24px 0",
          }}
        >
          Add up to 15 topics. Room runs 5 debates then closes.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {topics.map((t, i) => (
            <div
              key={i}
              style={{
                background: "var(--dark2)",
                border: "1px solid var(--border)",
                padding: "16px",
                position: "relative",
              }}
            >
              {/* Topic number + remove */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <span
                  style={{
                    fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                    fontSize: "9px",
                    letterSpacing: "2px",
                    textTransform: "uppercase",
                    color: "var(--g)",
                  }}
                >
                  Topic {String(i + 1).padStart(2, "0")}
                </span>
                {topics.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--dim)",
                      fontSize: "11px",
                      cursor: "pointer",
                      fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                      letterSpacing: "1px",
                    }}
                  >
                    REMOVE
                  </button>
                )}
              </div>

              {/* Topic input */}
              <div style={{ marginBottom: "10px" }}>
                <label style={labelStyle}>Debate Topic</label>
                <input
                  value={t.topic}
                  onChange={(e) => updateTopic(i, "topic", e.target.value)}
                  placeholder="e.g. Greatest of All Time"
                  maxLength={120}
                  style={inputStyle}
                />
              </div>

              {/* Sides */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ ...labelStyle, color: "#60a5fa" }}>Side A</label>
                  <input
                    value={t.sideALabel}
                    onChange={(e) => updateTopic(i, "sideALabel", e.target.value)}
                    placeholder="e.g. Messi"
                    maxLength={40}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ ...labelStyle, color: "#fb923c" }}>Side B</label>
                  <input
                    value={t.sideBLabel}
                    onChange={(e) => updateTopic(i, "sideBLabel", e.target.value)}
                    placeholder="e.g. Ronaldo"
                    maxLength={40}
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>
          ))}

          {/* Add topic button */}
          {topics.length < 15 && (
            <button
              type="button"
              onClick={addRow}
              style={{
                background: "transparent",
                border: "1px dashed var(--border2)",
                padding: "12px",
                cursor: "pointer",
                fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                fontSize: "10px",
                letterSpacing: "2px",
                textTransform: "uppercase",
                color: "var(--dim)",
                transition: "border-color 0.2s, color 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--g)";
                e.currentTarget.style.color = "var(--g)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border2)";
                e.currentTarget.style.color = "var(--dim)";
              }}
            >
              + Add Topic ({topics.length}/15)
            </button>
          )}

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
            {loading ? "Creating..." : "Create Featured Room"}
          </button>
        </form>
      </div>
    </div>
  );
}
