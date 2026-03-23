"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CURRENT_SEASON } from "@/lib/season";

// ── Feature flag ───────────────────────────────────────────────────────────────
// Set to true to expose the Ranked (Elo-based) leaderboard tab
const SHOW_RANKED = false;

const PAGE_SIZE = 20;

// ── Types ──────────────────────────────────────────────────────────────────────

type Mode = "unranked" | "ranked";
type Section = "global" | "regional";
type Period = "alltime" | "season";

interface Player {
  id: string;
  username: string;
  country: string | null;
  wins: number;
  losses: number;
  draws: number;
  winPct: number;
  elo: number;
  debates_count: number;
}

interface MyStats {
  userId: string;
  rank: number;
  wins: number;
  losses: number;
  draws: number;
  elo: number;
  winPct: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

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

const PODIUM_STYLES = [
  // index 0 → rank 2 (Runner Up)
  {
    badge: "Runner Up",
    borderColor: "rgba(148,163,184,0.2)",
    boxShadow: "none",
    badgeBg: "rgba(148,163,184,0.07)",
    badgeColor: "#94a3b8",
    badgeBorder: "rgba(148,163,184,0.15)",
    numColor: "#94a3b8",
    trackColor: "#94a3b8",
    ghostStroke: "rgba(236,236,236,0.04)",
    isChampion: false,
    displayRank: 2,
  },
  // index 1 → rank 1 (Champion)
  {
    badge: "Champion",
    borderColor: "rgba(234,179,8,0.5)",
    boxShadow:
      "0 0 60px rgba(234,179,8,0.09), inset 0 0 80px rgba(234,179,8,0.025)",
    badgeBg: "rgba(234,179,8,0.1)",
    badgeColor: "#eab308",
    badgeBorder: "rgba(234,179,8,0.25)",
    numColor: "#eab308",
    trackColor: "#eab308",
    ghostStroke: "rgba(234,179,8,0.1)",
    isChampion: true,
    displayRank: 1,
  },
  // index 2 → rank 3 (3rd Place)
  {
    badge: "3rd Place",
    borderColor: "rgba(180,83,9,0.25)",
    boxShadow: "none",
    badgeBg: "rgba(180,83,9,0.08)",
    badgeColor: "#b45309",
    badgeBorder: "rgba(180,83,9,0.2)",
    numColor: "#b45309",
    trackColor: "#b45309",
    ghostStroke: "rgba(236,236,236,0.04)",
    isChampion: false,
    displayRank: 3,
  },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function PodiumCard({
  player,
  styleIndex,
  mode,
}: {
  player: Player;
  styleIndex: number;
  mode: Mode;
}) {
  const [hovered, setHovered] = useState(false);
  const router = useRouter();
  const s = PODIUM_STYLES[styleIndex];
  const color = avatarColor(player.id);
  const bigNum =
    mode === "ranked" ? player.elo.toLocaleString() : String(player.wins);
  const bigLabel = mode === "ranked" ? "ELO" : "Wins";

  const bottomStats =
    mode === "ranked"
      ? [
          { n: `${player.winPct}%`, l: "Win Rate" },
          { n: player.elo.toLocaleString(), l: "Elo" },
          { n: `${player.wins}W/${player.losses}L`, l: "Record" },
        ]
      : [
          { n: `${player.winPct}%`, l: "Win Rate" },
          { n: String(player.wins), l: "Wins" },
          { n: String(player.losses), l: "Losses" },
        ];

  return (
    <div
      onClick={() => router.push(`/profile/${player.username}`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "var(--dark3)" : "var(--card)",
        border: `1px solid ${s.borderColor}`,
        boxShadow: s.boxShadow,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        transition: "background 0.3s",
        cursor: "pointer",
      }}
    >
      {/* Ghost rank number */}
      <div
        style={{
          position: "absolute",
          right: "12px",
          top: "4px",
          fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
          fontSize: "88px",
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: "2px",
          color: "transparent",
          WebkitTextStroke: `1px ${s.ghostStroke}`,
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        {s.displayRank}
      </div>

      <div
        style={{
          padding: s.isChampion ? "24px 24px 0" : "32px 28px 0",
          flex: 1,
        }}
      >
        {/* Badge */}
        <div style={{ marginBottom: "18px" }}>
          <span
            style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "9px",
              letterSpacing: "2px",
              textTransform: "uppercase",
              padding: "4px 10px",
              borderRadius: "1px",
              background: s.badgeBg,
              color: s.badgeColor,
              border: `1px solid ${s.badgeBorder}`,
            }}
          >
            {s.badge}
          </span>
        </div>

        {/* Avatar */}
        <div
          style={{
            width: "52px",
            height: "52px",
            borderRadius: "50%",
            background: color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "18px",
            fontWeight: 700,
            color: "#fff",
            marginBottom: "14px",
            boxShadow: s.isChampion
              ? "0 0 0 2px rgba(234,179,8,0.5), 0 0 20px rgba(234,179,8,0.2)"
              : "none",
          }}
        >
          {player.username[0]?.toUpperCase() ?? "?"}
        </div>

        {/* Name + record */}
        <div
          style={{
            fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
            fontSize: "22px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "1px",
            marginBottom: "3px",
          }}
        >
          {player.username}
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "10px",
            color: "var(--dim)",
            letterSpacing: "1px",
            marginBottom: "18px",
          }}
        >
          {player.wins}W · {player.losses}L · {CURRENT_SEASON}
        </div>

        {/* Big number */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "8px",
            marginBottom: "6px",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
              fontSize: "48px",
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: "-1px",
              color: s.numColor,
            }}
          >
            {bigNum}
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "9px",
              color: "var(--dim)",
              letterSpacing: "2px",
              textTransform: "uppercase",
            }}
          >
            {bigLabel}
          </div>
        </div>
      </div>

      {/* Win rate track */}
      <div style={{ height: "2px", background: "var(--border2)", margin: "16px 24px 0" }}>
        <div
          style={{
            height: "100%",
            background: s.trackColor,
            width: `${player.winPct}%`,
          }}
        />
      </div>

      {/* Bottom stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "1px",
          background: "var(--border)",
          borderTop: "1px solid var(--border)",
          marginTop: "16px",
        }}
      >
        {bottomStats.map((stat) => (
          <div
            key={stat.l}
            style={{ background: "var(--dark2)", padding: "12px 14px" }}
          >
            <div
              style={{
                fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
                fontSize: "22px",
                fontWeight: 600,
                color: "var(--text)",
                lineHeight: 1,
              }}
            >
              {stat.n}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                fontSize: "8px",
                color: "var(--dim)",
                letterSpacing: "2px",
                textTransform: "uppercase",
                marginTop: "3px",
              }}
            >
              {stat.l}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayerRow({
  player,
  rank,
  mode,
  isMe,
}: {
  player: Player;
  rank: number;
  mode: Mode;
  isMe: boolean;
}) {
  const router = useRouter();
  const color = avatarColor(player.id);
  const rankColor =
    rank === 1
      ? "#fbbf24"
      : rank === 2
      ? "#94a3b8"
      : rank === 3
      ? "#b45309"
      : "var(--dim)";

  const colTemplate = "52px 1fr 110px 90px 70px 70px 90px";

  return (
    <div
      onClick={() => router.push(`/profile/${player.username}`)}
      style={{
        display: "grid",
        gridTemplateColumns: colTemplate,
        alignItems: "center",
        padding: "13px 16px",
        border: "1px solid var(--border)",
        borderTop: "none",
        background: isMe ? "rgba(0,255,135,0.04)" : "var(--card)",
        borderColor: isMe ? "rgba(0,255,135,0.15)" : "var(--border)",
        cursor: "pointer",
        position: "relative",
        overflow: "hidden",
        transition: "background 0.2s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = isMe
          ? "rgba(0,255,135,0.07)"
          : "var(--dark3)";
        const bar = e.currentTarget.querySelector(
          ".row-left-bar"
        ) as HTMLElement | null;
        if (bar) bar.style.width = "2px";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = isMe
          ? "rgba(0,255,135,0.04)"
          : "var(--card)";
        const bar = e.currentTarget.querySelector(
          ".row-left-bar"
        ) as HTMLElement | null;
        if (bar && !isMe) bar.style.width = "0";
      }}
    >
      {/* Left accent bar */}
      <div
        className="row-left-bar"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: isMe ? "2px" : "0",
          background: "var(--g)",
          transition: "width 0.25s",
        }}
      />

      {/* Rank */}
      <div
        style={{
          fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
          fontSize: "22px",
          fontWeight: 600,
          color: rankColor,
        }}
      >
        {rank}
      </div>

      {/* Player */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            background: isMe ? "var(--g)" : color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "13px",
            fontWeight: 700,
            color: isMe ? "#000" : "#fff",
            flexShrink: 0,
          }}
        >
          {player.username[0]?.toUpperCase() ?? "?"}
        </div>
        <div>
          <div
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--text)",
            }}
          >
            {player.username}
            {isMe ? " (You)" : ""}
          </div>
        </div>
      </div>

      {/* Country */}
      <div
        style={{
          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
          fontSize: "10px",
          color: "var(--dim)",
          letterSpacing: "1px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {player.country ?? "—"}
      </div>

      {/* Win rate */}
      <div style={{ textAlign: "right" }}>
        <div
          style={{
            height: "2px",
            background: "var(--border2)",
            borderRadius: "1px",
            overflow: "hidden",
            marginBottom: "4px",
            width: "60px",
            marginLeft: "auto",
          }}
        >
          <div
            style={{
              height: "100%",
              background: "var(--g)",
              borderRadius: "1px",
              width: `${player.winPct}%`,
            }}
          />
        </div>
        <span
          style={{
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "10px",
            color: "var(--dim)",
            display: "block",
            textAlign: "right",
          }}
        >
          {player.winPct}%
        </span>
      </div>

      {/* W */}
      <div
        style={{
          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
          fontSize: "12px",
          color: "var(--dim)",
          textAlign: "right",
        }}
      >
        {player.wins}
      </div>

      {/* L */}
      <div
        style={{
          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
          fontSize: "12px",
          color: "var(--dim)",
          textAlign: "right",
        }}
      >
        {player.losses}
      </div>

      {/* Rating (Elo for ranked, Wins for unranked) */}
      <div
        style={{
          textAlign: "right",
          fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
          fontSize: "24px",
          fontWeight: 600,
          color: "var(--g)",
          letterSpacing: "1px",
        }}
      >
        {mode === "ranked" ? player.elo.toLocaleString() : player.wins}
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "52px 1fr 110px 90px 70px 70px 90px",
        alignItems: "center",
        padding: "13px 16px",
        border: "1px solid var(--border)",
        borderTop: "none",
        background: "var(--card)",
        gap: "0",
      }}
    >
      {[44, 160, 80, 60, 28, 28, 48].map((w, i) => (
        <div
          key={i}
          style={{
            height: "10px",
            borderRadius: "2px",
            background: "var(--border2)",
            opacity: 0.6,
            width: `${w}px`,
            marginLeft: i >= 2 ? "auto" : "0",
          }}
        />
      ))}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function RankingsPage() {
  const ref = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<Mode>("unranked");
  const [section, setSection] = useState<Section>("global");
  const [period, setPeriod] = useState<Period>("alltime");
  const [page, setPage] = useState(1);

  const [players, setPlayers] = useState<Player[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [myStats, setMyStats] = useState<MyStats | null>(null);
  const [search, setSearch] = useState("");

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [mode, section, period]);

  // Fetch leaderboard
  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type: mode,
        section,
        period,
        page: String(page),
      });
      const res = await fetch(`/api/leaderboard?${params}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setPlayers(data.players ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setPlayers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [mode, section, period, page]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);


  // Fetch my stats — re-fetch when section/period changes
  useEffect(() => {
    const params = new URLSearchParams({ section, period });
    fetch(`/api/leaderboard/me?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setMyStats(data);
      })
      .catch(() => {});
  }, [section, period]);

  // Scroll reveal
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry, i) => {
          if (entry.isIntersecting)
            setTimeout(() => entry.target.classList.add("on"), i * 60);
        }),
      { threshold: 0.05 }
    );
    ref.current?.querySelectorAll(".rv").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [players]);

  // Derived data
  // Display order: [2nd, 1st, 3rd] (center is champion)
  const podiumDisplayOrder =
    page === 1 && players.length >= 3
      ? [players[1], players[0], players[2]]
      : [];
  const tableStartIndex = page === 1 && players.length >= 3 ? 3 : 0;
  const tableRows = players.slice(tableStartIndex);
  const rankOf = (i: number) =>
    (page - 1) * PAGE_SIZE + tableStartIndex + i + 1;

  // Client-side search filter — preserve original index for correct rank display
  const filtered = tableRows
    .map((p, originalIndex) => ({ player: p, originalIndex }))
    .filter(({ player }) =>
      player.username.toLowerCase().includes(search.toLowerCase())
    );

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const colHeaders =
    mode === "ranked"
      ? ["#", "Debater", "Country", "Win %", "W", "L", "Elo ↓"]
      : ["#", "Debater", "Country", "Win %", "W", "L", "Wins ↓"];

  return (
    <div style={{ paddingTop: "60px", minHeight: "100vh", background: "var(--dark)" }}>
      <div ref={ref}>

        {/* ── Page Header ── */}
        <div
          style={{
            padding: "64px 40px 0",
            borderBottom: "1px solid var(--border)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Ghost text */}
          <div
            style={{
              position: "absolute",
              fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
              fontSize: "clamp(100px, 16vw, 220px)",
              fontWeight: 700,
              letterSpacing: "-4px",
              color: "transparent",
              WebkitTextStroke: "1px rgba(0,255,135,0.04)",
              right: "-20px",
              top: "50%",
              transform: "translateY(-45%)",
              pointerEvents: "none",
              lineHeight: 1,
              whiteSpace: "nowrap",
              userSelect: "none",
            }}
          >
            RANKINGS
          </div>

          <div
            style={{
              maxWidth: "1400px",
              margin: "0 auto",
              display: "grid",
              gridTemplateColumns: "1fr auto",
              alignItems: "flex-end",
              paddingBottom: "40px",
              position: "relative",
              zIndex: 1,
            }}
          >
            {/* Left */}
            <div className="rv">
              <div className="sec-label" style={{ marginBottom: "16px" }}>
                {CURRENT_SEASON}
              </div>
              <h1
                style={{
                  fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
                  fontSize: "clamp(48px, 6vw, 88px)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "-2px",
                  lineHeight: 0.9,
                }}
              >
                {section === "global" ? "Global" : "Regional"}
                <br />
                <span style={{ color: "var(--g)" }}>Rankings</span>
              </h1>
            </div>

            {/* Right stat */}
            <div className="rv" style={{ textAlign: "right", paddingBottom: "4px" }}>
              <div
                style={{
                  fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
                  fontSize: "40px",
                  fontWeight: 600,
                  color: "var(--g)",
                  lineHeight: 1,
                  letterSpacing: "-1px",
                }}
              >
                {total > 0 ? total.toLocaleString() : "—"}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                  fontSize: "9px",
                  color: "var(--dim)",
                  letterSpacing: "2px",
                  textTransform: "uppercase",
                  marginTop: "2px",
                }}
              >
                Debaters
              </div>
            </div>
          </div>

          {/* Tab bar */}
          <div
            style={{
              maxWidth: "1400px",
              margin: "0 auto",
              display: "flex",
              alignItems: "center",
              borderTop: "1px solid var(--border)",
              position: "relative",
              zIndex: 1,
            }}
          >
            {/* Mode tabs (only if SHOW_RANKED) */}
            {SHOW_RANKED && (
              <>
                {(["unranked", "ranked"] as Mode[]).map((m, i) => (
                  <div key={m} style={{ display: "flex", alignItems: "center" }}>
                    {i > 0 && (
                      <div
                        style={{
                          width: "1px",
                          height: "16px",
                          background: "var(--border)",
                          margin: "0 4px",
                        }}
                      />
                    )}
                    <div
                      onClick={() => setMode(m)}
                      style={{
                        padding: "14px 24px",
                        fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                        fontSize: "10px",
                        letterSpacing: "2px",
                        textTransform: "uppercase",
                        color: mode === m ? "var(--g)" : "var(--dim)",
                        cursor: "pointer",
                        borderBottom:
                          mode === m
                            ? "2px solid var(--g)"
                            : "2px solid transparent",
                        position: "relative",
                        top: "1px",
                        transition: "all 0.2s",
                      }}
                    >
                      {m === "unranked" ? "Unranked" : "Ranked"}
                    </div>
                  </div>
                ))}
                <div
                  style={{
                    width: "1px",
                    height: "16px",
                    background: "var(--border2)",
                    margin: "0 8px",
                  }}
                />
              </>
            )}

            {/* Section tabs */}
            {(["global", "regional"] as Section[]).map((s, i) => (
              <div key={s} style={{ display: "flex", alignItems: "center" }}>
                {(i > 0 || SHOW_RANKED) && (
                  <div
                    style={{
                      width: "1px",
                      height: "16px",
                      background: "var(--border)",
                      margin: "0 4px",
                    }}
                  />
                )}
                <div
                  onClick={() => setSection(s)}
                  style={{
                    padding: "14px 24px",
                    fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                    fontSize: "10px",
                    letterSpacing: "2px",
                    textTransform: "uppercase",
                    color: section === s ? "var(--g)" : "var(--dim)",
                    cursor: "pointer",
                    borderBottom:
                      section === s
                        ? "2px solid var(--g)"
                        : "2px solid transparent",
                    position: "relative",
                    top: "1px",
                    transition: "all 0.2s",
                  }}
                >
                  {s === "global" ? "Global" : "Regional"}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Main content ── */}
        <div
          style={{
            maxWidth: "1400px",
            margin: "0 auto",
            padding: "40px 40px 80px",
            display: "grid",
            gridTemplateColumns: "1fr 300px",
            gap: "24px",
            alignItems: "start",
          }}
        >
          {/* ── Left column ── */}
          <div>

            {/* Period toggle */}
            <div
              className="rv"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                marginBottom: "24px",
              }}
            >
              {(["alltime", "season"] as Period[]).map((p) => (
                <div
                  key={p}
                  onClick={() => setPeriod(p)}
                  style={{
                    padding: "6px 16px",
                    fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                    fontSize: "9px",
                    letterSpacing: "2px",
                    textTransform: "uppercase",
                    color: period === p ? "#000" : "var(--dim)",
                    background: period === p ? "var(--g)" : "var(--card)",
                    border:
                      period === p
                        ? "1px solid var(--g)"
                        : "1px solid var(--border2)",
                    borderRadius: "2px",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  {p === "alltime" ? "All Time" : CURRENT_SEASON}
                </div>
              ))}
            </div>

            {/* Podium */}
            {podiumDisplayOrder.length === 3 && !loading && (
              <div
                className="rv"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: "12px",
                  marginBottom: "32px",
                }}
              >
                {podiumDisplayOrder.map((player, i) => (
                  <PodiumCard
                    key={player.id}
                    player={player}
                    styleIndex={i}
                    mode={mode}
                  />
                ))}
              </div>
            )}

            {/* Table header */}
            <div
              className="rv"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "12px",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                  fontSize: "10px",
                  color: "var(--dim)",
                  letterSpacing: "3px",
                  textTransform: "uppercase",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <div
                  style={{
                    width: "14px",
                    height: "1px",
                    background: "var(--dim)",
                  }}
                />
                All Debaters
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  background: "var(--card)",
                  border: "1px solid var(--border2)",
                  padding: "7px 14px",
                  borderRadius: "2px",
                }}
              >
                <span style={{ color: "var(--dim)", fontSize: "11px" }}>⌕</span>
                <input
                  type="text"
                  placeholder="Search debater..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    background: "none",
                    border: "none",
                    outline: "none",
                    fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                    fontSize: "10px",
                    color: "var(--text)",
                    letterSpacing: "1px",
                    width: "140px",
                  }}
                />
              </div>
            </div>

            {/* Column headers */}
            <div
              className="rv"
              style={{
                display: "grid",
                gridTemplateColumns: "52px 1fr 110px 90px 70px 70px 90px",
                padding: "10px 16px",
                fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                fontSize: "9px",
                color: "var(--dim)",
                letterSpacing: "2px",
                textTransform: "uppercase",
                border: "1px solid var(--border)",
                background: "var(--dark2)",
                marginBottom: "1px",
              }}
            >
              {colHeaders.map((h, i) => (
                <div
                  key={h}
                  style={{
                    textAlign: i >= 3 ? "right" : "left",
                    color: h.includes("↓") ? "var(--g)" : "var(--dim)",
                    cursor: "pointer",
                  }}
                >
                  {h}
                </div>
              ))}
            </div>

            {/* Rows */}
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
            ) : filtered.length === 0 ? (
              <div
                style={{
                  padding: "48px 16px",
                  textAlign: "center",
                  border: "1px solid var(--border)",
                  borderTop: "none",
                  background: "var(--card)",
                  fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                  fontSize: "10px",
                  color: "var(--dim)",
                  letterSpacing: "2px",
                  textTransform: "uppercase",
                }}
              >
                {section === "regional" && total === 0
                  ? "No players from your country yet."
                  : "No debaters found."}
              </div>
            ) : (
              filtered.map(({ player, originalIndex }) => (
                <PlayerRow
                  key={player.id}
                  player={player}
                  rank={rankOf(originalIndex)}
                  mode={mode}
                  isMe={player.id === myStats?.userId}
                />
              ))
            )}

            {/* Pagination */}
            {total > 0 && (
              <div
                className="rv"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "16px 0",
                  marginTop: "8px",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                    fontSize: "10px",
                    color: "var(--dim)",
                    letterSpacing: "1px",
                  }}
                >
                  {search
                    ? `${filtered.length} of ${total.toLocaleString()} debaters match "${search}"`
                    : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total.toLocaleString()} debaters`}
                </div>
                <div style={{ display: "flex", gap: "4px" }}>
                  {/* Prev */}
                  <div
                    onClick={() => page > 1 && setPage(page - 1)}
                    style={{
                      width: "32px",
                      height: "32px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "1px solid var(--border2)",
                      background: "var(--card)",
                      fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                      fontSize: "10px",
                      color: page > 1 ? "var(--dim)" : "var(--border2)",
                      borderRadius: "2px",
                      cursor: page > 1 ? "pointer" : "default",
                    }}
                  >
                    ←
                  </div>
                  {/* Page numbers */}
                  {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
                    const pg = page <= 2 ? i + 1 : page - 1 + i;
                    if (pg > totalPages) return null;
                    return (
                      <div
                        key={pg}
                        onClick={() => setPage(pg)}
                        style={{
                          width: "32px",
                          height: "32px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "1px solid var(--border2)",
                          background:
                            pg === page ? "var(--g)" : "var(--card)",
                          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                          fontSize: "10px",
                          color: pg === page ? "#000" : "var(--dim)",
                          borderRadius: "2px",
                          cursor: "pointer",
                        }}
                      >
                        {pg}
                      </div>
                    );
                  })}
                  {/* Next */}
                  <div
                    onClick={() => page < totalPages && setPage(page + 1)}
                    style={{
                      width: "32px",
                      height: "32px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "1px solid var(--border2)",
                      background: "var(--card)",
                      fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                      fontSize: "10px",
                      color: page < totalPages ? "var(--dim)" : "var(--border2)",
                      borderRadius: "2px",
                      cursor: page < totalPages ? "pointer" : "default",
                    }}
                  >
                    →
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Sidebar ── */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              position: "sticky",
              top: "76px",
            }}
          >
            {/* Your ranking */}
            <div
              className="rv"
              style={{
                background:
                  "linear-gradient(135deg, rgba(0,255,135,0.05), transparent)",
                border: "1px solid rgba(0,255,135,0.15)",
                padding: "20px 18px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                  fontSize: "9px",
                  color: "var(--g)",
                  letterSpacing: "3px",
                  textTransform: "uppercase",
                  marginBottom: "12px",
                }}
              >
                Your Ranking
              </div>

              {myStats ? (
                <>
                  <div
                    style={{
                      fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
                      fontSize: "64px",
                      fontWeight: 700,
                      color: "var(--text)",
                      lineHeight: 1,
                      letterSpacing: "-2px",
                      marginBottom: "4px",
                    }}
                  >
                    #{myStats.rank}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                      fontSize: "10px",
                      color: "var(--dim)",
                      letterSpacing: "1px",
                      marginBottom: "16px",
                    }}
                  >
                    of {total > 0 ? total.toLocaleString() : "—"} debaters
                  </div>
                  {SHOW_RANKED && (
                    <>
                      <div
                        style={{
                          fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
                          fontSize: "32px",
                          fontWeight: 600,
                          color: "var(--g)",
                          letterSpacing: "-1px",
                          marginBottom: "4px",
                        }}
                      >
                        {myStats.elo.toLocaleString()}
                      </div>
                      <div
                        style={{
                          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                          fontSize: "9px",
                          color: "var(--dim)",
                          letterSpacing: "2px",
                          textTransform: "uppercase",
                          marginBottom: "16px",
                        }}
                      >
                        Elo Rating
                      </div>
                    </>
                  )}
                  <div
                    style={{
                      display: "flex",
                      gap: "12px",
                      justifyContent: "center",
                      marginTop: "16px",
                      paddingTop: "16px",
                      borderTop: "1px solid rgba(0,255,135,0.1)",
                    }}
                  >
                    {[
                      { n: String(myStats.wins), l: "Wins" },
                      { n: String(myStats.losses), l: "Losses" },
                      { n: `${myStats.winPct}%`, l: "Win Rate" },
                    ].map((s) => (
                      <div key={s.l} style={{ textAlign: "center" }}>
                        <div
                          style={{
                            fontFamily:
                              "var(--font-oswald, 'Oswald', sans-serif)",
                            fontSize: "22px",
                            fontWeight: 600,
                            color: "var(--text)",
                          }}
                        >
                          {s.n}
                        </div>
                        <div
                          style={{
                            fontFamily:
                              "var(--font-mono, 'Roboto Mono', monospace)",
                            fontSize: "8px",
                            color: "var(--dim)",
                            letterSpacing: "2px",
                            textTransform: "uppercase",
                            marginTop: "2px",
                          }}
                        >
                          {s.l}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div
                  style={{
                    fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                    fontSize: "10px",
                    color: "var(--dim)",
                    letterSpacing: "1px",
                    padding: "16px 0",
                  }}
                >
                  Sign in to see your rank
                </div>
              )}

              <Link
                href="/profile"
                style={{
                  display: "block",
                  marginTop: "16px",
                  background: "var(--g)",
                  color: "#000",
                  padding: "10px",
                  borderRadius: "2px",
                  fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                  fontSize: "10px",
                  fontWeight: 500,
                  letterSpacing: "2px",
                  textTransform: "uppercase",
                  textDecoration: "none",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--g2)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--g)";
                }}
              >
                View your profile →
              </Link>
            </div>

            {/* Season info */}
            <div
              className="rv"
              style={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "14px 18px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                    fontSize: "9px",
                    color: "var(--dim)",
                    letterSpacing: "3px",
                    textTransform: "uppercase",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <div
                    style={{
                      width: "10px",
                      height: "1px",
                      background: "var(--dim)",
                    }}
                  />
                  {CURRENT_SEASON}
                </div>
              </div>
              <div style={{ padding: "16px 18px" }}>
                {[
                  { key: "Status", value: "● Live", green: true },
                  { key: "Leaderboard", value: mode === "ranked" ? "Ranked" : "Standard", green: false },
                  { key: "Total Debates", value: total > 0 ? total.toLocaleString() : "—", green: false },
                ].map((row, i, arr) => (
                  <div
                    key={row.key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "9px 0",
                      borderBottom:
                        i < arr.length - 1
                          ? "1px solid var(--border)"
                          : "none",
                    }}
                  >
                    <span
                      style={{
                        fontFamily:
                          "var(--font-mono, 'Roboto Mono', monospace)",
                        fontSize: "9px",
                        color: "var(--dim)",
                        letterSpacing: "1.5px",
                        textTransform: "uppercase",
                      }}
                    >
                      {row.key}
                    </span>
                    <span
                      style={{
                        fontFamily:
                          "var(--font-oswald, 'Oswald', sans-serif)",
                        fontSize: "16px",
                        fontWeight: 600,
                        color: row.green ? "var(--g)" : "var(--text)",
                      }}
                    >
                      {row.value}
                    </span>
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
