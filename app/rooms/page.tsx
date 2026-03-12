"use client";

import { useEffect, useRef, useState } from "react";

type DebateStatus = "live" | "soon";

interface Debate {
  id: string;
  status: DebateStatus;
  viewers: number;
  topic: string;
  sideA: string;
  sideB: string;
  phase: string;
  voteWidth: number;
  startsIn?: string;
}

const ALL_DEBATES: Debate[] = [
  {
    id: "1", status: "live", viewers: 847,
    topic: "Who's The Better Generational Talent?",
    sideA: "Erling Haaland", sideB: "Kylian Mbappé",
    phase: "Rebuttal Round", voteWidth: 58,
  },
  {
    id: "2", status: "live", viewers: 312,
    topic: "Greatest Player Of All Time",
    sideA: "Lionel Messi", sideB: "Cristiano Ronaldo",
    phase: "Opening Round", voteWidth: 63,
  },
  {
    id: "3", status: "soon", viewers: 89,
    topic: "Best Tactical System In Modern Football",
    sideA: "High Press", sideB: "Tiki-Taka",
    phase: "Join Room", voteWidth: 50, startsIn: "6 min",
  },
  {
    id: "4", status: "soon", viewers: 54,
    topic: "Premier League's Greatest Ever Season",
    sideA: "Man City 23/24", sideB: "Arsenal 03/04",
    phase: "Join Room", voteWidth: 50, startsIn: "14 min",
  },
  {
    id: "5", status: "live", viewers: 156,
    topic: "Best Midfielder Of His Generation",
    sideA: "Bellingham", sideB: "Pedri",
    phase: "Closing Round", voteWidth: 52,
  },
  {
    id: "6", status: "live", viewers: 204,
    topic: "Most Dominant Club Side Ever",
    sideA: "Barcelona 2009–11", sideB: "Real Madrid 2015–18",
    phase: "Opening Round", voteWidth: 47,
  },
  {
    id: "7", status: "soon", viewers: 31,
    topic: "Best International Manager Of The Decade",
    sideA: "Didier Deschamps", sideB: "Gareth Southgate",
    phase: "Join Room", voteWidth: 50, startsIn: "22 min",
  },
  {
    id: "8", status: "live", viewers: 119,
    topic: "Premier League GOAT Club",
    sideA: "Manchester United", sideB: "Manchester City",
    phase: "Rebuttal Round", voteWidth: 55,
  },
];

function RoomRow({ debate }: { debate: Debate }) {
  const [voteW, setVoteW] = useState(debate.voteWidth);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (debate.status !== "live") return;
    const id = setInterval(() => {
      setVoteW((w) => Math.max(35, Math.min(65, w + (Math.random() - 0.5) * 3)));
    }, 2200);
    return () => clearInterval(id);
  }, [debate.status]);

  const isLive = debate.status === "live";

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "#13131a" : "var(--card)",
        borderLeft: `2px solid ${isLive ? "var(--g)" : "var(--border)"}`,
        padding: "24px 32px",
        display: "grid",
        gridTemplateColumns: "160px 1fr 240px 140px",
        alignItems: "center",
        gap: "24px",
        transition: "background 0.25s",
        cursor: "pointer",
      }}
    >
      {/* Status */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "6px",
          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
          fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase",
          color: isLive ? "var(--red)" : "var(--g)",
        }}>
          <div className={isLive ? "status-dot-live" : ""} style={{
            width: "5px", height: "5px", borderRadius: "50%", background: "currentColor", flexShrink: 0,
          }} />
          {isLive ? "Live Now" : `In ${debate.startsIn}`}
        </div>
        <span style={{
          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
          fontSize: "10px", color: "var(--dim)", letterSpacing: "1px",
        }}>
          {isLive ? `${debate.viewers.toLocaleString()} watching` : `${debate.viewers} waiting`}
        </span>
      </div>

      {/* Topic */}
      <div style={{
        fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
        fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px",
        fontSize: "clamp(15px, 1.2vw, 20px)", lineHeight: 1.15,
      }}>
        {debate.topic}
      </div>

      {/* Sides + vote bar */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{
            flex: 1, padding: "6px 10px", background: "rgba(59,130,246,0.08)",
            border: "1px solid rgba(59,130,246,0.2)", borderRadius: "3px",
            fontSize: "11px", fontWeight: 600, color: "#60a5fa",
            display: "flex", flexDirection: "column", gap: "1px",
          }}>
            <span style={{ fontSize: "8px", opacity: 0.6, textTransform: "uppercase", letterSpacing: "1px", fontFamily: "var(--font-mono)" }}>Side A</span>
            {debate.sideA}
          </div>
          <span style={{
            fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
            fontSize: "11px", fontWeight: 700, color: "var(--dim)", letterSpacing: "2px",
          }}>VS</span>
          <div style={{
            flex: 1, padding: "6px 10px", background: "rgba(251,146,60,0.08)",
            border: "1px solid rgba(251,146,60,0.2)", borderRadius: "3px",
            fontSize: "11px", fontWeight: 600, color: "#fb923c",
            display: "flex", flexDirection: "column", gap: "1px",
          }}>
            <span style={{ fontSize: "8px", opacity: 0.6, textTransform: "uppercase", letterSpacing: "1px", fontFamily: "var(--font-mono)" }}>Side B</span>
            {debate.sideB}
          </div>
        </div>
        {isLive && (
          <div style={{ height: "2px", background: "var(--border2)", borderRadius: "2px", overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${voteW}%`,
              background: "linear-gradient(90deg, #3b82f6, #fb923c)",
              transition: "width 1.2s ease",
            }} />
          </div>
        )}
      </div>

      {/* Phase / CTA */}
      <div style={{
        fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
        fontSize: "10px", color: isLive ? "var(--g)" : "var(--dim)",
        letterSpacing: "1.5px", textTransform: "uppercase", textAlign: "right",
        whiteSpace: "nowrap",
      }}>
        {isLive ? `${debate.phase} →` : "Join Room →"}
      </div>
    </div>
  );
}

export default function RoomsPage() {
  const ref = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<"all" | "live" | "soon">("all");

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add("on");
        });
      },
      { threshold: 0.05 }
    );
    ref.current?.querySelectorAll(".rv").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const filtered = ALL_DEBATES.filter((d) => filter === "all" || d.status === filter);

  return (
    <main style={{ background: "var(--dark)", minHeight: "100vh", paddingTop: "80px" }}>
      <div ref={ref} style={{ maxWidth: "1100px", margin: "0 auto", padding: "60px 40px" }}>

        {/* Header */}
        <div className="rv" style={{ marginBottom: "48px" }}>
          <div className="sec-label">All Rooms</div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "24px" }}>
            <h1 style={{
              fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
              fontSize: "clamp(36px, 4vw, 64px)", fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "-1px", lineHeight: 1,
              margin: 0,
            }}>Live Debates</h1>

            {/* Filter tabs */}
            <div style={{ display: "flex", gap: "1px", background: "var(--border)", border: "1px solid var(--border)" }}>
              {(["all", "live", "soon"] as const).map((f) => (
                <FilterTab key={f} label={f === "all" ? "All" : f === "live" ? "Live Now" : "Starting Soon"} active={filter === f} onClick={() => setFilter(f)} />
              ))}
            </div>
          </div>
        </div>

        {/* Rooms list */}
        <div className="rv" style={{ display: "flex", flexDirection: "column", gap: "1px", background: "var(--border)", border: "1px solid var(--border)" }}>
          {filtered.map((d) => <RoomRow key={d.id} debate={d} />)}
        </div>

        {filtered.length === 0 && (
          <div style={{
            textAlign: "center", padding: "80px 0",
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "11px", color: "var(--dim)", letterSpacing: "2px", textTransform: "uppercase",
          }}>
            No rooms found
          </div>
        )}
      </div>
    </main>
  );
}

function FilterTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "10px 20px",
        background: active ? "var(--g3)" : hovered ? "#13131a" : "var(--card)",
        border: "none", cursor: "pointer",
        fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
        fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase",
        color: active ? "var(--g)" : hovered ? "var(--text)" : "var(--dim)",
        transition: "all 0.2s",
      }}
    >
      {label}
    </button>
  );
}
