"use client";

import { useState, useRef, useEffect } from "react";
import type { ChatMessage } from "@/types/socket";

export default function ChatPanel({
  messages,
  onSend,
}: {
  messages: ChatMessage[];
  onSend: (body: string) => void;
}) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = input.trim();
    if (!body) return;
    onSend(body);
    setInput("");
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--dark2)",
        borderLeft: "1px solid var(--border)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--border)",
          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
          fontSize: "9px",
          letterSpacing: "2.5px",
          textTransform: "uppercase",
          color: "var(--dim)",
        }}
      >
        Live Chat
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 16px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        {messages.map((msg) => (
          <div key={msg.id} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
              <span
                style={{
                  fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                  fontSize: "10px",
                  fontWeight: 600,
                  color: "var(--g)",
                }}
              >
                {msg.username}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                  fontSize: "9px",
                  color: "var(--dim)",
                }}
              >
                {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <div
              style={{
                fontFamily: "var(--font-body, 'Familjen Grotesk', sans-serif)",
                fontSize: "13px",
                color: "var(--text)",
                lineHeight: 1.4,
              }}
            >
              {msg.body}
            </div>
          </div>
        ))}

        {messages.length === 0 && (
          <div
            style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "10px",
              color: "var(--dim)",
              textAlign: "center",
              padding: "24px 0",
              letterSpacing: "1.5px",
            }}
          >
            No messages yet
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} style={{ padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={280}
            placeholder="Type a message..."
            style={{
              flex: 1,
              background: "var(--dark3)",
              border: "1px solid var(--border)",
              padding: "10px 12px",
              fontFamily: "var(--font-body, 'Familjen Grotesk', sans-serif)",
              fontSize: "13px",
              color: "var(--text)",
              outline: "none",
              borderRadius: "2px",
            }}
          />
          <button
            type="submit"
            style={{
              background: "var(--g)",
              border: "none",
              padding: "10px 16px",
              cursor: "pointer",
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "9px",
              fontWeight: 700,
              letterSpacing: "2px",
              textTransform: "uppercase",
              color: "var(--dark)",
              borderRadius: "2px",
            }}
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
