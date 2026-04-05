"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import Link from "next/link";

interface Props {
  onClose: () => void;
}

export default function ContactModal({ onClose }: Props) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<{ name: string; email: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setAuthLoading(false); return; }
      const { data: profile } = await supabase
        .from("profiles")
        .select("name, username")
        .eq("id", user.id)
        .single();
      setUserInfo({
        name: profile?.name || profile?.username || "Unknown",
        email: user.email ?? "",
      });
      setAuthLoading(false);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, message }),
    });

    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }

    setDone(true);
  };

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      onClick={handleBackdrop}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "20px",
      }}
    >
      <div style={{
        background: "var(--dark2)",
        border: "1px solid var(--border)",
        width: "100%",
        maxWidth: "480px",
        padding: "32px",
        position: "relative",
      }}>
        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: "16px", right: "16px",
            background: "transparent", border: "none", cursor: "pointer",
            color: "var(--dim)", fontSize: "18px", lineHeight: 1,
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--dim)")}
        >
          ✕
        </button>

        {/* Header */}
        <div style={{
          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
          fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase",
          color: "var(--dim)", marginBottom: "8px",
        }}>Support</div>
        <div style={{
          fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)",
          fontSize: "28px", fontWeight: 900, textTransform: "uppercase",
          letterSpacing: "-1px", color: "var(--text)", marginBottom: "24px",
        }}>Contact Us</div>

        {authLoading ? (
          <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "10px", color: "var(--dim)", letterSpacing: "2px", padding: "24px 0" }}>
            Loading…
          </div>
        ) : !userInfo ? (
          /* Not logged in */
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "11px", color: "var(--dim)", letterSpacing: "1px",
              marginBottom: "20px", lineHeight: 1.6,
            }}>
              You need to be signed in to contact support.
            </div>
            <button
              onClick={onClose}
              style={{
                padding: "10px 24px",
                background: "var(--g)", color: "#000",
                fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase",
                fontWeight: 700, border: "none", cursor: "pointer",
              }}
            >
              Sign In First
            </button>
          </div>
        ) : done ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "11px", color: "var(--g)", letterSpacing: "2px",
              textTransform: "uppercase", marginBottom: "10px",
            }}>Message sent.</div>
            <div style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "10px", color: "var(--dim)", letterSpacing: "1px",
            }}>We&apos;ll get back to you at {userInfo.email}.</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

            {/* Read-only account info */}
            <div style={{
              background: "var(--dark3)",
              border: "1px solid var(--border)",
              padding: "12px 14px",
              display: "flex", flexDirection: "column", gap: "6px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ ...labelStyle, marginBottom: "2px" }}>Submitting as</div>
                  <div style={{
                    fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                    fontSize: "11px", color: "var(--text)", letterSpacing: "0.5px",
                  }}>
                    {userInfo.name} · {userInfo.email}
                  </div>
                </div>
                <Link
                  href="/profile?action=change-email"
                  onClick={onClose}
                  style={{
                    fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                    fontSize: "8px", letterSpacing: "1.5px", textTransform: "uppercase",
                    color: "var(--dim)", textDecoration: "none",
                    borderBottom: "1px solid var(--border2)",
                    transition: "color 0.15s, border-color 0.15s",
                    flexShrink: 0,
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; e.currentTarget.style.borderColor = "var(--dim)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--dim)"; e.currentTarget.style.borderColor = "var(--border2)"; }}
                >
                  Change email →
                </Link>
              </div>
            </div>

            {/* Subject */}
            <div>
              <label style={labelStyle}>Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
                style={inputStyle}
                placeholder="What's this about?"
              />
            </div>

            {/* Message */}
            <div>
              <label style={labelStyle}>Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                maxLength={2000}
                rows={5}
                style={{ ...inputStyle, resize: "vertical", minHeight: "100px" }}
                placeholder="Describe your issue or question..."
              />
              <div style={{
                fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                fontSize: "8px", color: "var(--dim)", letterSpacing: "1px",
                textAlign: "right", marginTop: "4px",
              }}>
                {message.length}/2000
              </div>
            </div>

            {error && (
              <div style={{
                fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                fontSize: "10px", color: "var(--red)", letterSpacing: "1px",
              }}>{error}</div>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: "12px 24px",
                background: submitting ? "var(--border2)" : "var(--g)",
                color: "#000",
                fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase",
                fontWeight: 700, border: "none", cursor: submitting ? "not-allowed" : "pointer",
                transition: "background 0.2s", marginTop: "4px",
              }}
            >
              {submitting ? "Sending…" : "Send Message"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
  fontSize: "8px", letterSpacing: "2px", textTransform: "uppercase",
  color: "var(--dim)", marginBottom: "6px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--dark3)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
  fontSize: "11px",
  padding: "10px 12px",
  outline: "none",
};
