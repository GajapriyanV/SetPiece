"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Debate {
  id: string;
  result: "WIN" | "LOSS" | "DRAW";
  topic: string;
  sideA: string;
  sideB: string;
  userSide: "A" | "B";
  crowdCount: number;
  eloDelta: number;
  date: string;
}

interface UserProfile {
  username: string;
  name: string;
  country: string | null;
  club: string | null;
  joinDate: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  debates_count: number;
  rank: number;
  totalDebaters: number;
  debates: Debate[];
  avatar_url: string | null;
  upvotes_received: number;
  mvp_count: number;
}

// ── Ticker ────────────────────────────────────────────────────────────────────

const TICKER_TOPICS = [
  { icon: "⚽", topic: "Messi vs Ronaldo", category: "GOAT Debate" },
  { icon: "🔥", topic: "Haaland vs Mbappé", category: "Future GOAT" },
  { icon: "⚡", topic: "Best PL Season Ever", category: "City 23/24 vs Arsenal 03/04" },
  { icon: "🏆", topic: "Greatest Club", category: "Real Madrid vs Barça" },
  { icon: "🎯", topic: "Best Free Kick Taker", category: "All Time" },
  { icon: "💥", topic: "Bellingham vs Pedri", category: "Gen Z Midfield" },
];
const TICKER_ITEMS = [...TICKER_TOPICS, ...TICKER_TOPICS];

// ── Sub-components ─────────────────────────────────────────────────────────────

function DebateRow({ debate }: { debate: Debate }) {
  const isWin = debate.result === "WIN";
  const isDraw = debate.result === "DRAW";
  const accentColor = isWin ? "var(--g)" : isDraw ? "var(--dim)" : "var(--red)";

  return (
    <div
      className="rv"
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--dark3)";
        const bar = e.currentTarget.querySelector(".row-accent") as HTMLElement | null;
        if (bar) bar.style.opacity = "1";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--card)";
        const bar = e.currentTarget.querySelector(".row-accent") as HTMLElement | null;
        if (bar) bar.style.opacity = "0";
      }}
      style={{
        display: "grid",
        gridTemplateColumns: "64px 1fr auto",
        alignItems: "center",
        gap: "20px",
        padding: "18px 20px",
        background: "var(--card)",
        borderBottom: "1px solid var(--border)",
        position: "relative",
        overflow: "hidden",
        transition: "background 0.2s",
      }}
    >
      {/* Left accent bar */}
      <div
        className="row-accent"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: "2px",
          background: accentColor,
          opacity: 0,
          transition: "opacity 0.25s",
        }}
      />

      {/* WIN/LOSS/DRAW badge */}
      <div style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "5px 10px",
        fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
        fontSize: "9px",
        fontWeight: 700,
        letterSpacing: "2px",
        textTransform: "uppercase",
        borderRadius: "2px",
        background: isWin
          ? "rgba(0,255,135,0.1)"
          : isDraw
          ? "rgba(85,85,102,0.15)"
          : "rgba(255,45,85,0.1)",
        color: accentColor,
        border: `1px solid ${
          isWin
            ? "rgba(0,255,135,0.2)"
            : isDraw
            ? "rgba(85,85,102,0.25)"
            : "rgba(255,45,85,0.2)"
        }`,
        whiteSpace: "nowrap",
      }}>
        {debate.result}
      </div>

      {/* Topic + sides */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)",
          fontSize: "clamp(16px, 2vw, 20px)",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "-0.5px",
          color: "var(--text)",
          lineHeight: 1.1,
          marginBottom: "5px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {debate.topic}
        </div>
        <div style={{
          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
          fontSize: "9px",
          letterSpacing: "2px",
          textTransform: "uppercase",
          color: "var(--dim)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}>
          <span style={{ color: debate.userSide === "A" ? "var(--g)" : "var(--dim)" }}>{debate.sideA}</span>
          <span style={{ color: "var(--border2)" }}>vs</span>
          <span style={{ color: debate.userSide === "B" ? "var(--g)" : "var(--dim)" }}>{debate.sideB}</span>
          <span style={{ width: "1px", height: "10px", background: "var(--border2)", display: "inline-block", verticalAlign: "middle" }} />
          <span>{debate.date}</span>
        </div>
      </div>

      {/* Right: crowd + elo delta */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px", flexShrink: 0 }}>
        <div style={{
          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
          fontSize: "9px",
          color: "var(--dim)",
          letterSpacing: "1px",
          display: "flex",
          alignItems: "center",
          gap: "5px",
        }}>
          <span style={{ fontSize: "10px" }}>👥</span>
          {debate.crowdCount.toLocaleString()}
        </div>
        <div style={{
          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
          fontSize: "9px",
          letterSpacing: "1px",
          color: debate.eloDelta > 0 ? "var(--g)" : debate.eloDelta < 0 ? "var(--red)" : "var(--dim)",
        }}>
          {debate.eloDelta > 0 ? "+" : ""}{debate.eloDelta} ELO
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function PublicProfilePage() {
  const params = useParams();
  const username = params.username as string;
  const ref = useRef<HTMLDivElement>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/profile/${encodeURIComponent(username)}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then((data) => {
        if (data) { setProfile(data); setLoading(false); }
      })
      .catch(() => setLoading(false));
  }, [username]);

  useEffect(() => {
    if (!profile) return;
    const obs = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry, i) => {
          if (entry.isIntersecting) setTimeout(() => entry.target.classList.add("on"), i * 50);
        }),
      { threshold: 0.05 }
    );
    ref.current?.querySelectorAll(".rv").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [profile]);

  const winRate =
    profile && profile.wins + profile.losses + profile.draws > 0
      ? Math.round((profile.wins / (profile.wins + profile.losses + profile.draws)) * 100)
      : 0;

  return (
    <div style={{ paddingTop: "60px", paddingBottom: "48px", minHeight: "100vh", background: "var(--dark)" }}>
      <div ref={ref}>

        {/* ── Profile Header ── */}
        <div style={{
          borderBottom: "1px solid var(--border)",
          position: "relative",
          overflow: "hidden",
        }}>
          {/* Ghost watermark */}
          <div style={{
            position: "absolute",
            fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)",
            fontSize: "clamp(100px, 18vw, 260px)",
            fontWeight: 900,
            letterSpacing: "-6px",
            color: "transparent",
            WebkitTextStroke: "1px rgba(0,255,135,0.04)",
            right: "-20px",
            top: "50%",
            transform: "translateY(-50%)",
            pointerEvents: "none",
            lineHeight: 1,
            whiteSpace: "nowrap",
            userSelect: "none",
          }}>
            PROFILE
          </div>

          <div style={{
            maxWidth: "1400px",
            margin: "0 auto",
            padding: "56px 40px 0",
            position: "relative",
            zIndex: 1,
          }}>
            {loading ? (
              <div style={{
                paddingBottom: "40px",
                fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                fontSize: "11px",
                color: "var(--dim)",
                letterSpacing: "2px",
                textTransform: "uppercase",
              }}>
                Loading…
              </div>
            ) : notFound ? (
              <div style={{ paddingBottom: "40px" }}>
                <div style={{
                  fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                  fontSize: "11px",
                  color: "var(--red)",
                  letterSpacing: "2px",
                  textTransform: "uppercase",
                  marginBottom: "16px",
                }}>
                  Player not found.
                </div>
                <Link
                  href="/rankings"
                  style={{
                    fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                    fontSize: "10px",
                    color: "var(--dim)",
                    letterSpacing: "2px",
                    textTransform: "uppercase",
                    textDecoration: "none",
                    borderBottom: "1px solid var(--border2)",
                    paddingBottom: "2px",
                  }}
                >
                  ← Back to rankings
                </Link>
              </div>
            ) : profile ? (
              <>
                {/* Top row: avatar + info */}
                <div className="rv" style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "28px",
                  paddingBottom: "40px",
                }}>
                  {/* Avatar */}
                  <div style={{
                    width: "80px",
                    height: "80px",
                    borderRadius: "50%",
                    background: profile.avatar_url ? "transparent" : "linear-gradient(135deg, var(--g), #00c06a)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)",
                    fontSize: "32px",
                    fontWeight: 900,
                    color: "#000",
                    flexShrink: 0,
                    boxShadow: "0 0 0 2px rgba(0,255,135,0.25), 0 0 32px rgba(0,255,135,0.12)",
                    overflow: "hidden",
                  }}>
                    {profile.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={profile.avatar_url} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      (profile.name || profile.username)[0].toUpperCase()
                    )}
                  </div>

                  {/* Name block */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)",
                      fontSize: "clamp(32px, 4vw, 52px)",
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: "-2px",
                      lineHeight: 0.9,
                      color: "var(--text)",
                      marginBottom: "8px",
                    }}>
                      {profile.name || profile.username}
                    </div>

                    <div style={{
                      fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                      fontSize: "12px",
                      color: "var(--dim)",
                      letterSpacing: "1px",
                      marginBottom: "14px",
                    }}>
                      @{profile.username}
                    </div>

                    {/* Meta row */}
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      flexWrap: "wrap",
                    }}>
                      {[
                        { label: "Joined", value: profile.joinDate },
                        ...(profile.club ? [{ label: "Club", value: profile.club }] : []),
                        ...(profile.country ? [{ label: "Country", value: profile.country }] : []),
                      ].map((meta, i) => (
                        <span key={meta.label} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          {i > 0 && (
                            <span style={{ width: "1px", height: "10px", background: "var(--border2)", display: "inline-block" }} />
                          )}
                          <span style={{
                            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                            fontSize: "9px",
                            letterSpacing: "2px",
                            textTransform: "uppercase",
                            color: "var(--dim)",
                            fontVariant: "small-caps",
                          }}>
                            {meta.label}
                          </span>
                          <span style={{
                            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                            fontSize: "9px",
                            letterSpacing: "2px",
                            textTransform: "uppercase",
                            color: "var(--text)",
                            fontVariant: "small-caps",
                          }}>
                            {meta.value}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── Stats strip ── */}
                <div className="rv" style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr 1fr",
                  gap: "1px",
                  background: "var(--border)",
                  border: "1px solid var(--border)",
                  borderBottom: "none",
                }}>
                  {/* Global Rank */}
                  <div style={{ background: "var(--dark2)", padding: "22px 28px" }}>
                    <div style={{
                      fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                      fontSize: "9px",
                      letterSpacing: "3px",
                      textTransform: "uppercase",
                      color: "var(--dim)",
                      marginBottom: "8px",
                    }}>Global Rank</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                      <div style={{
                        fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)",
                        fontSize: "clamp(32px, 4vw, 56px)",
                        fontWeight: 900,
                        letterSpacing: "-2px",
                        lineHeight: 1,
                        color: "var(--text)",
                      }}>
                        #{profile.rank}
                      </div>
                      <div style={{
                        fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                        fontSize: "10px",
                        color: "var(--dim)",
                        letterSpacing: "1px",
                      }}>
                        of {profile.totalDebaters.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Win Rate */}
                  <div style={{ background: "var(--dark2)", padding: "22px 28px" }}>
                    <div style={{
                      fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                      fontSize: "9px",
                      letterSpacing: "3px",
                      textTransform: "uppercase",
                      color: "var(--dim)",
                      marginBottom: "8px",
                    }}>Win Rate</div>
                    <div style={{
                      fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)",
                      fontSize: "clamp(32px, 4vw, 56px)",
                      fontWeight: 900,
                      letterSpacing: "-2px",
                      lineHeight: 1,
                      color: "var(--text)",
                      marginBottom: "8px",
                    }}>
                      {winRate}%
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ height: "2px", background: "var(--border2)", borderRadius: "1px", flex: 1, overflow: "hidden" }}>
                        <div style={{ height: "100%", background: "var(--g)", width: `${winRate}%`, transition: "width 1s ease" }} />
                      </div>
                      <div style={{
                        fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                        fontSize: "9px",
                        color: "var(--dim)",
                        letterSpacing: "1.5px",
                        whiteSpace: "nowrap",
                      }}>
                        {profile.wins}W · {profile.losses}L
                      </div>
                    </div>
                  </div>

                  {/* MVPs */}
                  <div style={{ background: "var(--dark2)", padding: "22px 28px" }}>
                    <div style={{
                      fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                      fontSize: "9px",
                      letterSpacing: "3px",
                      textTransform: "uppercase",
                      color: "var(--dim)",
                      marginBottom: "8px",
                    }}>MVPs</div>
                    <div style={{
                      fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)",
                      fontSize: "clamp(32px, 4vw, 56px)",
                      fontWeight: 900,
                      letterSpacing: "-2px",
                      lineHeight: 1,
                      color: "#ffc800",
                    }}>
                      {(profile.mvp_count ?? 0).toLocaleString()}
                    </div>
                  </div>

                  {/* Total Upvotes */}
                  <div style={{ background: "var(--dark2)", padding: "22px 28px" }}>
                    <div style={{
                      fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                      fontSize: "9px",
                      letterSpacing: "3px",
                      textTransform: "uppercase",
                      color: "var(--dim)",
                      marginBottom: "8px",
                    }}>Total Upvotes</div>
                    <div style={{
                      fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)",
                      fontSize: "clamp(32px, 4vw, 56px)",
                      fontWeight: 900,
                      letterSpacing: "-2px",
                      lineHeight: 1,
                      color: "var(--text)",
                    }}>
                      {(profile.upvotes_received ?? 0).toLocaleString()}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div style={{
                paddingBottom: "40px",
                fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                fontSize: "11px",
                color: "var(--red)",
                letterSpacing: "2px",
                textTransform: "uppercase",
              }}>
                Could not load profile.
              </div>
            )}
          </div>
        </div>

        {/* ── Debate History ── */}
        {profile && (
          <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "40px 40px 80px" }}>

            {/* Section header */}
            <div className="rv" style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "16px",
            }}>
              <div className="sec-label" style={{ marginBottom: 0 }}>
                Debate History
              </div>
              <div style={{
                fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                fontSize: "9px",
                color: "var(--dim)",
                letterSpacing: "2px",
                textTransform: "uppercase",
              }}>
                {profile.debates_count} debates total
              </div>
            </div>

            {profile.debates.length === 0 ? (
              <div className="rv" style={{
                padding: "40px 20px",
                textAlign: "center",
                fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                fontSize: "11px",
                color: "var(--dim)",
                letterSpacing: "2px",
                textTransform: "uppercase",
                border: "1px solid var(--border)",
              }}>
                No debates yet.
              </div>
            ) : (
              <>
                {/* Column labels */}
                <div className="rv" style={{
                  display: "grid",
                  gridTemplateColumns: "64px 1fr auto",
                  gap: "20px",
                  padding: "10px 20px",
                  fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                  fontSize: "9px",
                  color: "var(--dim)",
                  letterSpacing: "2px",
                  textTransform: "uppercase",
                  background: "var(--dark2)",
                  border: "1px solid var(--border)",
                  marginBottom: "1px",
                }}>
                  <div>Result</div>
                  <div>Topic</div>
                  <div style={{ textAlign: "right" }}>Crowd · Elo</div>
                </div>

                {/* Debate rows */}
                <div style={{ border: "1px solid var(--border)", borderTop: "none" }}>
                  {profile.debates.map((debate) => (
                    <DebateRow key={debate.id} debate={debate} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Bottom Ticker ── */}
        <div style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          borderTop: "1px solid var(--border)",
          overflow: "hidden",
          padding: "12px 0",
          background: "var(--dark2)",
        }}>
          <div className="ticker-track" style={{ display: "flex", whiteSpace: "nowrap" }}>
            {TICKER_ITEMS.map((item, i) => (
              <span
                key={i}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "0 32px",
                  fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                  fontSize: "11px",
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  color: "var(--dim)",
                }}
              >
                <b style={{ color: "var(--g)", fontWeight: 400 }}>{item.icon}</b>
                {item.topic}
                <span style={{ color: "var(--border2)" }}>—</span>
                {item.category}
              </span>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
