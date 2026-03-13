"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── Data ──────────────────────────────────────────────────────────────────────

const PODIUM = [
  {
    rank: 2,
    badge: "Runner Up",
    name: "FootballIQ99",
    record: "9W · 1L · Season 01",
    rating: 2187,
    winRate: 90,
    avgCrowd: "847",
    mindShifts: "+2",
    avatarBg: "#3b82f6",
    initial: "F",
    borderColor: "rgba(148,163,184,0.2)",
    boxShadow: "none",
    badgeBg: "rgba(148,163,184,0.07)",
    badgeColor: "#94a3b8",
    badgeBorder: "rgba(148,163,184,0.15)",
    ratingColor: "#94a3b8",
    trackColor: "#94a3b8",
    ghostStroke: "rgba(236,236,236,0.04)",
  },
  {
    rank: 1,
    badge: "Champion",
    name: "TacticalGenius_",
    record: "12W · 2L · Season 01",
    rating: 2341,
    winRate: 86,
    avgCrowd: "1,203",
    mindShifts: "+4",
    avatarBg: "#f59e0b",
    initial: "T",
    borderColor: "rgba(234,179,8,0.5)",
    boxShadow: "0 0 60px rgba(234,179,8,0.09), inset 0 0 80px rgba(234,179,8,0.025)",
    badgeBg: "rgba(234,179,8,0.1)",
    badgeColor: "#eab308",
    badgeBorder: "rgba(234,179,8,0.25)",
    ratingColor: "#eab308",
    trackColor: "#eab308",
    ghostStroke: "rgba(234,179,8,0.1)",
    isChampion: true,
  },
  {
    rank: 3,
    badge: "3rd Place",
    name: "UltrasFCB",
    record: "8W · 3L · Season 01",
    rating: 2054,
    winRate: 73,
    avgCrowd: "612",
    mindShifts: "+1",
    avatarBg: "#ef4444",
    initial: "U",
    borderColor: "rgba(180,83,9,0.25)",
    boxShadow: "none",
    badgeBg: "rgba(180,83,9,0.08)",
    badgeColor: "#b45309",
    badgeBorder: "rgba(180,83,9,0.2)",
    ratingColor: "#b45309",
    trackColor: "#b45309",
    ghostStroke: "rgba(236,236,236,0.04)",
  },
];

const PLAYERS = [
  { rank: 4,  name: "xGWizard",        tag: "xG Analytics",         avatarBg: "#8b5cf6", w: 7, l: 2, rating: 1987, change: 34,  dir: "up",   online: true  },
  { rank: 5,  name: "PressureMerkel",  tag: "High Press Believer",  avatarBg: "#22c55e", w: 6, l: 1, rating: 1923, change: 56,  dir: "up",   online: false },
  { rank: 6,  name: "RealMadridDNA",   tag: "Hala Madrid",          avatarBg: "#f97316", w: 8, l: 4, rating: 1876, change: 187, dir: "up",   online: true  },
  { rank: 7,  name: "KloppIsGod",      tag: "Gegenpressing Guru",   avatarBg: "#06b6d4", w: 5, l: 2, rating: 1812, change: 142, dir: "up",   online: true  },
  { rank: 8,  name: "TikiTakaMaster",  tag: "Positional Play",      avatarBg: "#ec4899", w: 6, l: 3, rating: 1754, change: 21,  dir: "down", online: false },
  { rank: 9,  name: "You",             tag: "Your Profile",         avatarBg: "var(--g)",w: 6, l: 2, rating: 1744, change: 38,  dir: "up",   online: true, isMe: true },
  { rank: 10, name: "BarcaForever",    tag: "Mes Que Un Club",      avatarBg: "#3b82f6", w: 4, l: 3, rating: 1698, change: 98,  dir: "down", online: false },
  { rank: 11, name: "DeepBlockPete",   tag: "Park The Bus FC",      avatarBg: "#a78bfa", w: 5, l: 4, rating: 1643, change: 76,  dir: "up",   online: false },
  { rank: 12, name: "OffsideTrapQueen",tag: "Tactical Genius",      avatarBg: "#fb923c", w: 4, l: 2, rating: 1589, change: 12,  dir: "up",   online: true  },
  { rank: 13, name: "LowBlockLegend",  tag: "Counter Attack King",  avatarBg: "#34d399", w: 3, l: 3, rating: 1521, change: 44,  dir: "down", online: false },
];

const TOP_MOVERS = [
  { name: "RealMadridDNA", sub: "↑ 14 positions", gain: "+187", positive: true,  avatarBg: "#22c55e", initial: "R" },
  { name: "KloppIsGod",    sub: "↑ 9 positions",  gain: "+142", positive: true,  avatarBg: "#8b5cf6", initial: "K" },
  { name: "BarcaForever",  sub: "↓ 6 positions",  gain: "−98",  positive: false, avatarBg: "#f97316", initial: "B" },
  { name: "DeepBlockPete", sub: "↑ 5 positions",  gain: "+76",  positive: true,  avatarBg: "#06b6d4", initial: "D" },
];

const SEASON_INFO = [
  { key: "Status",    value: "● Live",    green: true  },
  { key: "Week",      value: "14 of 20",  green: false },
  { key: "Debates",   value: "1,847",     green: false },
  { key: "Votes Cast",value: "94,231",    green: false },
  { key: "Resets In", value: "43 days",   green: true  },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function PodiumCard({ p }: { p: typeof PODIUM[0] }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "var(--dark3)" : "var(--card)",
        border: `1px solid ${p.borderColor}`,
        boxShadow: p.boxShadow,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        transition: "background 0.3s",
        cursor: "pointer",
      }}
    >
      {/* Ghost rank number */}
      <div style={{
        position: "absolute", right: "12px", top: "4px",
        fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
        fontSize: "88px", fontWeight: 700, lineHeight: 1, letterSpacing: "2px",
        color: "transparent",
        WebkitTextStroke: `1px ${p.ghostStroke}`,
        pointerEvents: "none", userSelect: "none",
      }}>
        {p.rank}
      </div>

      {/* Inner content */}
      <div style={{ padding: p.rank === 1 ? "24px 24px 0" : "32px 28px 0", flex: 1 }}>
        {/* Badge */}
        <div style={{ marginBottom: "18px" }}>
          <span style={{
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase",
            padding: "4px 10px", borderRadius: "1px",
            background: p.badgeBg, color: p.badgeColor, border: `1px solid ${p.badgeBorder}`,
          }}>
            {p.badge}
          </span>
        </div>

        {/* Avatar */}
        <div style={{
          width: "52px", height: "52px", borderRadius: "50%",
          background: p.avatarBg,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "18px", fontWeight: 700, color: "#fff",
          marginBottom: "14px",
          boxShadow: p.isChampion ? "0 0 0 2px rgba(234,179,8,0.5), 0 0 20px rgba(234,179,8,0.2)" : "none",
        }}>
          {p.initial}
        </div>

        {/* Name + record */}
        <div style={{
          fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
          fontSize: "22px", fontWeight: 600, textTransform: "uppercase",
          letterSpacing: "1px", marginBottom: "3px",
        }}>
          {p.name}
        </div>
        <div style={{
          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
          fontSize: "10px", color: "var(--dim)", letterSpacing: "1px", marginBottom: "18px",
        }}>
          {p.record}
        </div>

        {/* Rating */}
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "6px" }}>
          <div style={{
            fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
            fontSize: "48px", fontWeight: 700, lineHeight: 1, letterSpacing: "-1px",
            color: p.ratingColor,
          }}>
            {p.rating.toLocaleString()}
          </div>
          <div style={{
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "9px", color: "var(--dim)", letterSpacing: "2px", textTransform: "uppercase",
          }}>
            ELO
          </div>
        </div>
      </div>

      {/* Win rate track */}
      <div style={{ height: "2px", background: "var(--border2)", margin: "16px 24px 0" }}>
        <div style={{ height: "100%", background: p.trackColor, width: `${p.winRate}%` }} />
      </div>

      {/* Bottom stats */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
        gap: "1px", background: "var(--border)",
        borderTop: "1px solid var(--border)", marginTop: "16px",
      }}>
        {[
          { n: `${p.winRate}%`, l: "Win Rate" },
          { n: p.avgCrowd, l: "Avg Crowd" },
          { n: p.mindShifts, l: "Mind Shifts" },
        ].map((s) => (
          <div key={s.l} style={{ background: "var(--dark2)", padding: "12px 14px" }}>
            <div style={{
              fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
              fontSize: "22px", fontWeight: 600, color: "var(--text)", lineHeight: 1,
            }}>{s.n}</div>
            <div style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "8px", color: "var(--dim)", letterSpacing: "2px",
              textTransform: "uppercase", marginTop: "3px",
            }}>{s.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayerRow({ p, delay }: { p: typeof PLAYERS[0]; delay: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const wr = Math.round((p.w / (p.w + p.l)) * 100);
  const rankColor = p.rank === 1 ? "#fbbf24" : p.rank === 2 ? "#94a3b8" : p.rank === 3 ? "#b45309" : "var(--dim)";

  return (
    <div
      ref={ref}
      className="rv"
      style={{
        display: "grid",
        gridTemplateColumns: "52px 1fr 90px 70px 70px 90px 90px",
        alignItems: "center",
        padding: "13px 16px",
        border: "1px solid var(--border)",
        borderTop: "none",
        background: p.isMe ? "rgba(0,255,135,0.04)" : "var(--card)",
        borderColor: p.isMe ? "rgba(0,255,135,0.15)" : "var(--border)",
        cursor: "pointer",
        position: "relative",
        overflow: "hidden",
        transition: "background 0.2s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = p.isMe ? "rgba(0,255,135,0.07)" : "var(--dark3)";
        const bar = e.currentTarget.querySelector(".row-left-bar") as HTMLElement | null;
        if (bar) bar.style.width = "2px";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = p.isMe ? "rgba(0,255,135,0.04)" : "var(--card)";
        const bar = e.currentTarget.querySelector(".row-left-bar") as HTMLElement | null;
        if (bar && !p.isMe) bar.style.width = "0";
      }}
    >
      {/* Left accent bar */}
      <div className="row-left-bar" style={{
        position: "absolute", left: 0, top: 0, bottom: 0,
        width: p.isMe ? "2px" : "0",
        background: "var(--g)", transition: "width 0.25s",
      }} />

      {/* Rank */}
      <div style={{
        fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
        fontSize: "22px", fontWeight: 600, color: rankColor,
      }}>{p.rank}</div>

      {/* Player */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{
          width: "36px", height: "36px", borderRadius: "50%",
          background: p.avatarBg === "var(--g)" ? "var(--g)" : p.avatarBg,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "13px", fontWeight: 700,
          color: p.avatarBg === "var(--g)" ? "#000" : "#fff",
          flexShrink: 0, position: "relative",
        }}>
          {p.name[0]}
          {p.online && (
            <div style={{
              position: "absolute", bottom: "1px", right: "1px",
              width: "8px", height: "8px", background: "var(--g)",
              borderRadius: "50%", border: "2px solid var(--card)",
            }} />
          )}
        </div>
        <div>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>
            {p.name}{p.isMe ? " (You)" : ""}
          </div>
          <div style={{
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "9px", color: "var(--dim)", letterSpacing: "1px", marginTop: "2px",
          }}>{p.tag}</div>
        </div>
      </div>

      {/* Win rate */}
      <div style={{ textAlign: "right" }}>
        <div style={{ height: "2px", background: "var(--border2)", borderRadius: "1px", overflow: "hidden", marginBottom: "4px", width: "60px", marginLeft: "auto" }}>
          <div style={{ height: "100%", background: "var(--g)", borderRadius: "1px", width: `${wr}%` }} />
        </div>
        <span style={{
          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
          fontSize: "10px", color: "var(--dim)", display: "block", textAlign: "right",
        }}>{wr}%</span>
      </div>

      {/* W */}
      <div style={{
        fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
        fontSize: "12px", color: "var(--dim)", textAlign: "right",
      }}>{p.w}</div>

      {/* L */}
      <div style={{
        fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
        fontSize: "12px", color: "var(--dim)", textAlign: "right",
      }}>{p.l}</div>

      {/* Rating */}
      <div style={{
        textAlign: "right",
        fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
        fontSize: "24px", fontWeight: 600, color: "var(--g)", letterSpacing: "1px",
      }}>{p.rating.toLocaleString()}</div>

      {/* Change */}
      <div style={{ textAlign: "right" }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: "3px",
          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
          fontSize: "9px", letterSpacing: "1px",
          padding: "2px 7px", borderRadius: "2px",
          background: p.dir === "up" ? "rgba(0,255,135,0.1)" : "rgba(255,45,85,0.1)",
          color: p.dir === "up" ? "var(--g)" : "var(--red)",
        }}>
          {p.dir === "up" ? "↑" : "↓"} {p.change}
        </span>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function RankingsPage() {
  const ref = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<"global" | "week">("global");
  const [search, setSearch] = useState("");
  const [debaterCount, setDebaterCount] = useState(2431);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((entry, i) => {
        if (entry.isIntersecting) setTimeout(() => entry.target.classList.add("on"), i * 60);
      }),
      { threshold: 0.05 }
    );
    ref.current?.querySelectorAll(".rv").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setDebaterCount((c) => c + Math.floor(Math.random() * 2));
    }, 6000);
    return () => clearInterval(id);
  }, []);

  const filtered = PLAYERS.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.tag.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ paddingTop: "60px", minHeight: "100vh", background: "var(--dark)" }}>
      <div ref={ref}>

        {/* ── Page Header ── */}
        <div style={{
          padding: "64px 40px 0",
          borderBottom: "1px solid var(--border)",
          position: "relative", overflow: "hidden",
        }}>
          {/* Ghost text */}
          <div style={{
            position: "absolute",
            fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
            fontSize: "clamp(100px, 16vw, 220px)",
            fontWeight: 700, letterSpacing: "-4px",
            color: "transparent",
            WebkitTextStroke: "1px rgba(0,255,135,0.04)",
            right: "-20px", top: "50%", transform: "translateY(-45%)",
            pointerEvents: "none", lineHeight: 1, whiteSpace: "nowrap", userSelect: "none",
          }}>
            RANKINGS
          </div>

          <div style={{
            maxWidth: "1400px", margin: "0 auto",
            display: "grid", gridTemplateColumns: "1fr auto",
            alignItems: "flex-end", paddingBottom: "40px",
            position: "relative", zIndex: 1,
          }}>
            {/* Left */}
            <div className="rv">
              <div className="sec-label" style={{ marginBottom: "16px" }}>Season 01 · Week 14</div>
              <h1 style={{
                fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
                fontSize: "clamp(48px, 6vw, 88px)",
                fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "-2px", lineHeight: 0.9,
              }}>
                Global<br />
                <span style={{ color: "var(--g)" }}>Rankings</span>
              </h1>
            </div>

            {/* Right stat */}
            <div className="rv" style={{ textAlign: "right", paddingBottom: "4px" }}>
              <div style={{
                fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
                fontSize: "40px", fontWeight: 600, color: "var(--g)",
                lineHeight: 1, letterSpacing: "-1px",
              }}>
                {debaterCount.toLocaleString()}
              </div>
              <div style={{
                fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                fontSize: "9px", color: "var(--dim)", letterSpacing: "2px",
                textTransform: "uppercase", marginTop: "2px",
              }}>
                Ranked Debaters
              </div>
            </div>
          </div>

          {/* Tab bar */}
          <div style={{
            maxWidth: "1400px", margin: "0 auto",
            display: "flex", alignItems: "center",
            borderTop: "1px solid var(--border)",
            position: "relative", zIndex: 1,
          }}>
            {(["global", "week"] as const).map((tab, i) => (
              <div key={tab} style={{ display: "flex", alignItems: "center" }}>
                {i > 0 && <div style={{ width: "1px", height: "16px", background: "var(--border)", margin: "0 4px" }} />}
                <div
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: "14px 24px",
                    fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                    fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase",
                    color: activeTab === tab ? "var(--g)" : "var(--dim)",
                    cursor: "pointer",
                    borderBottom: activeTab === tab ? "2px solid var(--g)" : "2px solid transparent",
                    position: "relative", top: "1px",
                    transition: "all 0.2s",
                  }}
                >
                  {tab === "global" ? "Global" : "This Week"}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Main content ── */}
        <div style={{
          maxWidth: "1400px", margin: "0 auto",
          padding: "40px 40px 80px",
          display: "grid",
          gridTemplateColumns: "1fr 300px",
          gap: "24px",
          alignItems: "start",
        }}>

          {/* ── Left column ── */}
          <div>

            {/* Podium */}
            <div className="rv" style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "12px",
              marginBottom: "32px",
            }}>
              {PODIUM.map((p) => <PodiumCard key={p.rank} p={p} />)}
            </div>

            {/* Table header */}
            <div className="rv" style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: "12px",
            }}>
              <div style={{
                fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                fontSize: "10px", color: "var(--dim)", letterSpacing: "3px",
                textTransform: "uppercase",
                display: "flex", alignItems: "center", gap: "8px",
              }}>
                <div style={{ width: "14px", height: "1px", background: "var(--dim)" }} />
                All Debaters
              </div>
              <div style={{
                display: "flex", alignItems: "center", gap: "8px",
                background: "var(--card)", border: "1px solid var(--border2)",
                padding: "7px 14px", borderRadius: "2px",
              }}>
                <span style={{ color: "var(--dim)", fontSize: "11px" }}>⌕</span>
                <input
                  type="text"
                  placeholder="Search debater..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    background: "none", border: "none", outline: "none",
                    fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                    fontSize: "10px", color: "var(--text)", letterSpacing: "1px", width: "140px",
                  }}
                />
              </div>
            </div>

            {/* Column headers */}
            <div className="rv" style={{
              display: "grid",
              gridTemplateColumns: "52px 1fr 90px 70px 70px 90px 90px",
              padding: "10px 16px",
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "9px", color: "var(--dim)", letterSpacing: "2px", textTransform: "uppercase",
              border: "1px solid var(--border)",
              background: "var(--dark2)", marginBottom: "1px",
            }}>
              {["#", "Debater", "Win Rate", "W", "L", "Rating ↓", "Change"].map((h, i) => (
                <div key={h} style={{
                  textAlign: i >= 2 ? "right" : "left",
                  cursor: "pointer",
                  color: h === "Rating ↓" ? "var(--g)" : "var(--dim)",
                }}>
                  {h}
                </div>
              ))}
            </div>

            {/* Rows */}
            {filtered.map((p, i) => (
              <PlayerRow key={p.rank} p={p} delay={i * 40} />
            ))}

            {/* Pagination */}
            <div className="rv" style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 0", marginTop: "8px",
            }}>
              <div style={{
                fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                fontSize: "10px", color: "var(--dim)", letterSpacing: "1px",
              }}>
                Showing 4–13 of {debaterCount.toLocaleString()} debaters
              </div>
              <div style={{ display: "flex", gap: "4px" }}>
                {["←", "1", "2", "3", "...", "243", "→"].map((label, i) => (
                  <a
                    key={i}
                    href="#"
                    style={{
                      width: "32px", height: "32px",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      border: label === "..." ? "none" : "1px solid var(--border2)",
                      background: label === "1" ? "var(--g)" : "var(--card)",
                      fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                      fontSize: "10px",
                      color: label === "1" ? "#000" : label === "..." ? "var(--dim)" : "var(--dim)",
                      borderRadius: "2px", textDecoration: "none",
                      cursor: label === "..." ? "default" : "pointer",
                    }}
                  >
                    {label}
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* ── Sidebar ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", position: "sticky", top: "76px" }}>

            {/* Your ranking */}
            <div className="rv" style={{
              background: "linear-gradient(135deg, rgba(0,255,135,0.05), transparent)",
              border: "1px solid rgba(0,255,135,0.15)",
              padding: "20px 18px", textAlign: "center",
            }}>
              <div style={{
                fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                fontSize: "9px", color: "var(--g)", letterSpacing: "3px",
                textTransform: "uppercase", marginBottom: "12px",
              }}>
                Your Ranking
              </div>
              <div style={{
                fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
                fontSize: "64px", fontWeight: 700, color: "var(--text)",
                lineHeight: 1, letterSpacing: "-2px", marginBottom: "4px",
              }}>
                #47
              </div>
              <div style={{
                fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                fontSize: "10px", color: "var(--dim)", letterSpacing: "1px", marginBottom: "16px",
              }}>
                of {debaterCount.toLocaleString()} debaters
              </div>
              <div style={{
                fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
                fontSize: "32px", fontWeight: 600, color: "var(--g)", letterSpacing: "-1px", marginBottom: "4px",
              }}>
                1,744
              </div>
              <div style={{
                fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                fontSize: "9px", color: "var(--dim)", letterSpacing: "2px", textTransform: "uppercase",
              }}>
                Elo Rating
              </div>
              <div style={{
                display: "flex", gap: "12px", justifyContent: "center",
                marginTop: "16px", paddingTop: "16px",
                borderTop: "1px solid rgba(0,255,135,0.1)",
              }}>
                {[{ n: "6", l: "Wins" }, { n: "2", l: "Losses" }, { n: "75%", l: "Win Rate" }].map((s) => (
                  <div key={s.l} style={{ textAlign: "center" }}>
                    <div style={{
                      fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
                      fontSize: "22px", fontWeight: 600, color: "var(--text)",
                    }}>{s.n}</div>
                    <div style={{
                      fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                      fontSize: "8px", color: "var(--dim)", letterSpacing: "2px",
                      textTransform: "uppercase", marginTop: "2px",
                    }}>{s.l}</div>
                  </div>
                ))}
              </div>
              <Link
                href="/profile"
                style={{
                  display: "block", marginTop: "16px",
                  background: "var(--g)", color: "#000",
                  padding: "10px", borderRadius: "2px",
                  fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                  fontSize: "10px", fontWeight: 500, letterSpacing: "2px",
                  textTransform: "uppercase", textDecoration: "none",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--g2)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--g)"; }}
              >
                View your profile →
              </Link>
            </div>

            {/* Top movers */}
            <div className="rv" style={{ background: "var(--card)", border: "1px solid var(--border)", overflow: "hidden" }}>
              <div style={{
                padding: "14px 18px", borderBottom: "1px solid var(--border)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div style={{
                  fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                  fontSize: "9px", color: "var(--dim)", letterSpacing: "3px", textTransform: "uppercase",
                  display: "flex", alignItems: "center", gap: "8px",
                }}>
                  <div style={{ width: "10px", height: "1px", background: "var(--dim)" }} />
                  Top Movers
                </div>
                <a href="#" style={{
                  fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                  fontSize: "9px", color: "var(--dim)", letterSpacing: "1px", textDecoration: "none",
                  transition: "color 0.2s",
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--g)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--dim)"; }}
                >
                  This week →
                </a>
              </div>
              <div style={{ padding: "16px 18px" }}>
                {TOP_MOVERS.map((m, i) => (
                  <div key={m.name} style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "10px 0",
                    borderBottom: i < TOP_MOVERS.length - 1 ? "1px solid var(--border)" : "none",
                  }}>
                    <div style={{
                      width: "30px", height: "30px", borderRadius: "50%",
                      background: m.avatarBg,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "11px", fontWeight: 700, color: "#fff", flexShrink: 0,
                    }}>{m.initial}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "1px", color: "var(--text)" }}>{m.name}</div>
                      <div style={{
                        fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                        fontSize: "9px", color: "var(--dim)", letterSpacing: "1px",
                      }}>{m.sub}</div>
                    </div>
                    <div style={{
                      fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
                      fontSize: "18px", fontWeight: 600,
                      color: m.positive ? "var(--g)" : "var(--red)",
                    }}>{m.gain}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Season info */}
            <div className="rv" style={{ background: "var(--card)", border: "1px solid var(--border)", overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
                <div style={{
                  fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                  fontSize: "9px", color: "var(--dim)", letterSpacing: "3px", textTransform: "uppercase",
                  display: "flex", alignItems: "center", gap: "8px",
                }}>
                  <div style={{ width: "10px", height: "1px", background: "var(--dim)" }} />
                  Season 01
                </div>
              </div>
              <div style={{ padding: "16px 18px" }}>
                {SEASON_INFO.map((row, i) => (
                  <div key={row.key} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "9px 0",
                    borderBottom: i < SEASON_INFO.length - 1 ? "1px solid var(--border)" : "none",
                  }}>
                    <span style={{
                      fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                      fontSize: "9px", color: "var(--dim)", letterSpacing: "1.5px", textTransform: "uppercase",
                    }}>{row.key}</span>
                    <span style={{
                      fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
                      fontSize: "16px", fontWeight: 600,
                      color: row.green ? "var(--g)" : "var(--text)",
                    }}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
