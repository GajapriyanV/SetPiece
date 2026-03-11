"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

const PLAYERS = [
  { rank: 1, initial: "T", color: "#f59e0b", name: "TacticalGenius_", sub: "12W · 2L this week", w: 12, l: 2, rating: 2341 },
  { rank: 2, initial: "F", color: "#3b82f6", name: "FootballIQ99", sub: "9W · 1L this week", w: 9, l: 1, rating: 2187 },
  { rank: 3, initial: "U", color: "#ef4444", name: "UltrasFCB", sub: "8W · 3L this week", w: 8, l: 3, rating: 2054 },
  { rank: 4, initial: "X", color: "#8b5cf6", name: "xGWizard", sub: "7W · 2L this week", w: 7, l: 2, rating: 1987 },
  { rank: 5, initial: "P", color: "#22c55e", name: "PressureMerkel", sub: "6W · 1L this week", w: 6, l: 1, rating: 1923 },
];

const rankColor = (r: number) => {
  if (r === 1) return "#fbbf24";
  if (r === 2) return "#94a3b8";
  if (r === 3) return "#b45309";
  return "var(--dim)";
};

export default function LeaderboardPreview() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, i) => {
          if (entry.isIntersecting) {
            setTimeout(() => entry.target.classList.add("on"), i * 80);
          }
        });
      },
      { threshold: 0.1 }
    );
    ref.current?.querySelectorAll(".rv").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <section
      id="leaderboard"
      style={{
        background: "var(--dark2)",
        borderTop: "1px solid var(--border)",
        padding: "100px 40px",
      }}
    >
      <div ref={ref} style={{ maxWidth: "1400px", margin: "0 auto" }}>
        <div className="rv">
          <div className="sec-label">Rankings</div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1.4fr",
            gap: "80px",
            alignItems: "start",
            marginTop: "60px",
          }}
        >
          {/* Left — text */}
          <div className="rv">
            <h2
              style={{
                fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
                fontSize: "clamp(40px, 5vw, 64px)",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "-1px",
                lineHeight: 0.95,
                marginBottom: "24px",
              }}
            >
              The Top
              <br />
              Debaters
              <br />
              <span style={{ color: "var(--g)" }}>On Earth.</span>
            </h2>
            <p
              style={{
                fontSize: "15px",
                color: "var(--dim)",
                lineHeight: 1.8,
                maxWidth: "340px",
                marginBottom: "32px",
              }}
            >
              Every debate is on the record. Win consistently and your name rises here. The leaderboard updates in real time after every result.
            </p>
            <Link
              href="/leaderboard"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                background: "transparent",
                border: "1px solid var(--border2)",
                color: "var(--text)",
                padding: "12px 24px",
                fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                fontSize: "11px",
                letterSpacing: "2px",
                textTransform: "uppercase",
                textDecoration: "none",
                borderRadius: "2px",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--g)";
                e.currentTarget.style.color = "var(--g)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border2)";
                e.currentTarget.style.color = "var(--text)";
              }}
            >
              View full leaderboard →
            </Link>
          </div>

          {/* Right — table */}
          <div className="rv">
            <div style={{ border: "1px solid var(--border)" }}>
              {/* Header */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "44px 1fr 64px 64px 80px",
                  padding: "12px 20px",
                  borderBottom: "1px solid var(--border)",
                  fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                  fontSize: "9px",
                  letterSpacing: "2px",
                  textTransform: "uppercase",
                  color: "var(--dim)",
                }}
              >
                <span>#</span>
                <span>Debater</span>
                <span style={{ textAlign: "right" }}>W</span>
                <span style={{ textAlign: "right" }}>L</span>
                <span style={{ textAlign: "right" }}>Rating</span>
              </div>

              {/* Rows */}
              {PLAYERS.map((p, i) => (
                <div
                  key={p.name}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "44px 1fr 64px 64px 80px",
                    alignItems: "center",
                    padding: "14px 20px",
                    borderBottom: i < PLAYERS.length - 1 ? "1px solid var(--border)" : "none",
                    transition: "background 0.2s",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = "rgba(0,255,135,0.02)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = "transparent";
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
                      fontSize: "24px",
                      fontWeight: 600,
                      color: rankColor(p.rank),
                    }}
                  >
                    {p.rank}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div
                      style={{
                        width: "34px",
                        height: "34px",
                        borderRadius: "50%",
                        background: p.color,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "13px",
                        fontWeight: 700,
                        color: "#fff",
                        flexShrink: 0,
                      }}
                    >
                      {p.initial}
                    </div>
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: 600 }}>{p.name}</div>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "var(--dim)",
                          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                        }}
                      >
                        {p.sub}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      textAlign: "right",
                      fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                      fontSize: "12px",
                      color: "var(--dim)",
                    }}
                  >
                    {p.w}
                  </div>
                  <div
                    style={{
                      textAlign: "right",
                      fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                      fontSize: "12px",
                      color: "var(--dim)",
                    }}
                  >
                    {p.l}
                  </div>
                  <div
                    style={{
                      textAlign: "right",
                      fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
                      fontSize: "22px",
                      fontWeight: 600,
                      color: "var(--g)",
                      letterSpacing: "1px",
                    }}
                  >
                    {p.rating}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
