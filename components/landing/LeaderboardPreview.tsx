"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface Player {
  id: string;
  username: string;
  wins: number;
  losses: number;
  winPct: number;
}

const AVATAR_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#22c55e",
  "#f59e0b",
  "#06b6d4",
  "#ec4899",
  "#f97316",
  "#a78bfa",
];

function avatarColor(id: string): string {
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const rankColor = (r: number) => {
  if (r === 1) return "#fbbf24";
  if (r === 2) return "#94a3b8";
  if (r === 3) return "#b45309";
  return "var(--dim)";
};

export default function LeaderboardPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const [players, setPlayers] = useState<Player[]>([]);

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

  useEffect(() => {
    fetch("/api/leaderboard?type=unranked&section=global&period=alltime&page=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.players) setPlayers(data.players.slice(0, 5));
      })
      .catch(() => {});
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
              Every debate is on the record. Win consistently and your name
              rises here. The leaderboard updates in real time after every
              result.
            </p>
            <Link
              href="/rankings"
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
                <span style={{ textAlign: "right" }}>Wins ↓</span>
              </div>

              {/* Rows */}
              {players.length === 0
                ? Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "44px 1fr 64px 64px 80px",
                        alignItems: "center",
                        padding: "14px 20px",
                        borderBottom: i < 4 ? "1px solid var(--border)" : "none",
                        gap: "8px",
                      }}
                    >
                      {[32, 120, 28, 28, 36].map((w, j) => (
                        <div
                          key={j}
                          style={{
                            height: "10px",
                            borderRadius: "2px",
                            background: "var(--border2)",
                            opacity: 0.5,
                            width: `${w}px`,
                            marginLeft: j >= 2 ? "auto" : "0",
                          }}
                        />
                      ))}
                    </div>
                  ))
                : players.map((p, i) => (
                    <div
                      key={p.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "44px 1fr 64px 64px 80px",
                        alignItems: "center",
                        padding: "14px 20px",
                        borderBottom:
                          i < players.length - 1
                            ? "1px solid var(--border)"
                            : "none",
                        transition: "background 0.2s",
                        cursor: "pointer",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background =
                          "rgba(0,255,135,0.02)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background =
                          "transparent";
                      }}
                    >
                      <div
                        style={{
                          fontFamily:
                            "var(--font-oswald, 'Oswald', sans-serif)",
                          fontSize: "24px",
                          fontWeight: 600,
                          color: rankColor(i + 1),
                        }}
                      >
                        {i + 1}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                        }}
                      >
                        <div
                          style={{
                            width: "34px",
                            height: "34px",
                            borderRadius: "50%",
                            background: avatarColor(p.id),
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "13px",
                            fontWeight: 700,
                            color: "#fff",
                            flexShrink: 0,
                          }}
                        >
                          {p.username[0]?.toUpperCase() ?? "?"}
                        </div>
                        <div>
                          <div style={{ fontSize: "14px", fontWeight: 600 }}>
                            {p.username}
                          </div>
                          <div
                            style={{
                              fontSize: "11px",
                              color: "var(--dim)",
                              fontFamily:
                                "var(--font-mono, 'Roboto Mono', monospace)",
                            }}
                          >
                            {p.wins}W · {p.losses}L · {p.winPct}% win rate
                          </div>
                        </div>
                      </div>
                      <div
                        style={{
                          textAlign: "right",
                          fontFamily:
                            "var(--font-mono, 'Roboto Mono', monospace)",
                          fontSize: "12px",
                          color: "var(--dim)",
                        }}
                      >
                        {p.wins}
                      </div>
                      <div
                        style={{
                          textAlign: "right",
                          fontFamily:
                            "var(--font-mono, 'Roboto Mono', monospace)",
                          fontSize: "12px",
                          color: "var(--dim)",
                        }}
                      >
                        {p.losses}
                      </div>
                      <div
                        style={{
                          textAlign: "right",
                          fontFamily:
                            "var(--font-oswald, 'Oswald', sans-serif)",
                          fontSize: "22px",
                          fontWeight: 600,
                          color: "var(--g)",
                          letterSpacing: "1px",
                        }}
                      >
                        {p.wins}
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
