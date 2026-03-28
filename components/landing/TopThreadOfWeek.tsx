"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CATEGORY_COLORS } from "@/lib/forumCategories";

interface Thread {
  id: string;
  title: string;
  flair: string;
  upvotes_count: number;
  reply_count: number;
  author: { username: string; name: string; avatar_url: string | null };
}

export default function ThePitchSection() {
  const [topThread, setTopThread] = useState<Thread | null>(null);

  useEffect(() => {
    fetch("/api/forum?sort=top&page=1")
      .then((r) => r.json())
      .then((data) => {
        if (data.topThread && data.topThread.upvotes_count > 0) {
          setTopThread(data.topThread);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <section style={{ borderBottom: "1px solid var(--border)", padding: "80px 40px" }}>
      <div style={{ maxWidth: "1400px", margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "24px", marginBottom: "40px", flexWrap: "wrap" }}>
          <div>
            <div className="sec-label" style={{ marginBottom: "12px" }}>Community</div>
            <div style={{
              fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)",
              fontSize: "clamp(40px, 6vw, 80px)",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "-3px",
              lineHeight: 0.9,
              color: "var(--text)",
              marginBottom: "16px",
            }}>
              The Pitch
            </div>
            <div style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "12px",
              color: "var(--dim)",
              letterSpacing: "0.5px",
              lineHeight: 1.6,
              maxWidth: "480px",
            }}>
              The Pitch is SetPiece&apos;s community forum. Post your takes, reply to debates, and rack up upvotes. The best posts earn MVP status when a thread closes.
            </div>
          </div>

          <Link
            href="/forum"
            style={{
              padding: "12px 28px",
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--dim)",
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "11px",
              letterSpacing: "2px",
              textTransform: "uppercase",
              textDecoration: "none",
              flexShrink: 0,
              transition: "all 0.2s",
              display: "inline-block",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--text)";
              e.currentTarget.style.color = "var(--text)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.color = "var(--dim)";
            }}
          >
            Join the Discussion →
          </Link>
        </div>

        {/* Top Thread of the Week (only shown when one exists) */}
        {topThread && (
          <div>
            <div style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "9px",
              letterSpacing: "3px",
              textTransform: "uppercase",
              color: "#ffc800",
              marginBottom: "12px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}>
              <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: "#ffc800" }} />
              Top Thread This Week
            </div>

            <Link href={`/forum/${topThread.id}`} style={{ textDecoration: "none", display: "block" }}>
              <div
                style={{
                  background: "rgba(255,200,0,0.03)",
                  border: "1px solid rgba(255,200,0,0.15)",
                  borderLeft: "3px solid #ffc800",
                  padding: "24px 28px",
                  transition: "background 0.2s",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,200,0,0.06)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,200,0,0.03)"; }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                  <span style={{
                    fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                    fontSize: "8px", letterSpacing: "2px", textTransform: "uppercase",
                    color: CATEGORY_COLORS[topThread.flair] ?? "var(--dim)",
                    border: `1px solid ${CATEGORY_COLORS[topThread.flair] ?? "var(--dim)"}40`,
                    padding: "2px 8px",
                  }}>
                    {topThread.flair}
                  </span>
                </div>

                <div style={{
                  fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)",
                  fontSize: "clamp(22px, 3vw, 36px)",
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "-1px",
                  lineHeight: 1,
                  color: "var(--text)",
                  marginBottom: "14px",
                }}>
                  {topThread.title}
                </div>

                <div style={{
                  fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                  fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase",
                  color: "var(--dim)",
                  display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap",
                }}>
                  <span>{topThread.upvotes_count} likes</span>
                  <span style={{ color: "var(--border2)" }}>·</span>
                  <span>{topThread.reply_count} replies</span>
                  <span style={{ color: "var(--border2)" }}>·</span>
                  <span>{topThread.author?.name || topThread.author?.username}</span>
                  <span style={{ marginLeft: "auto", color: "#ffc800" }}>Read the debate →</span>
                </div>
              </div>
            </Link>
          </div>
        )}

        {/* Empty state — invite to post */}
        {!topThread && (
          <div style={{
            border: "1px solid var(--border)",
            padding: "40px 28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "24px",
            flexWrap: "wrap",
          }}>
            <div style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "11px",
              color: "var(--dim)",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
            }}>
              No threads yet — be the first to start a debate.
            </div>
            <Link
              href="/forum"
              style={{
                padding: "10px 22px",
                background: "var(--g)",
                color: "#000",
                fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                fontSize: "11px",
                letterSpacing: "2px",
                textTransform: "uppercase",
                fontWeight: 700,
                textDecoration: "none",
                flexShrink: 0,
              }}
            >
              Post First →
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
