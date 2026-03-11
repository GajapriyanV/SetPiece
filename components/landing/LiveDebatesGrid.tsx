"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type DebateStatus = "live" | "soon" | "upcoming";

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

const DEBATES: Debate[] = [
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
];

function DebateCard({ debate }: { debate: Debate }) {
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
  const borderColor = isLive ? "var(--g)" : "var(--border)";

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "#13131a" : "var(--card)",
        borderLeft: `2px solid ${borderColor}`,
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        gap: "0",
        transition: "background 0.25s",
        cursor: "pointer",
        position: "relative",
      }}
    >
      {/* Status row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "6px",
          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
          fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase",
          color: isLive ? "var(--red)" : "var(--g)",
        }}>
          <div className={isLive ? "status-dot-live" : ""} style={{
            width: "5px", height: "5px", borderRadius: "50%", background: "currentColor", flexShrink: 0,
          }} />
          {isLive ? "Live Now" : `Starting in ${debate.startsIn}`}
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
        fontSize: "clamp(16px, 1.4vw, 22px)", lineHeight: 1.1,
        marginBottom: "20px", flex: 1,
      }}>
        {debate.topic}
      </div>

      {/* Sides */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
        <div style={{
          flex: 1, padding: "8px 12px", background: "rgba(59,130,246,0.08)",
          border: "1px solid rgba(59,130,246,0.2)", borderRadius: "3px",
          fontSize: "12px", fontWeight: 600, color: "#60a5fa",
          display: "flex", flexDirection: "column", gap: "2px",
        }}>
          <span style={{ fontSize: "9px", opacity: 0.6, textTransform: "uppercase", letterSpacing: "1px", fontFamily: "var(--font-mono)" }}>Side A</span>
          {debate.sideA}
        </div>
        <span style={{
          fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
          fontSize: "13px", fontWeight: 700, color: "var(--dim)", letterSpacing: "2px",
        }}>VS</span>
        <div style={{
          flex: 1, padding: "8px 12px", background: "rgba(251,146,60,0.08)",
          border: "1px solid rgba(251,146,60,0.2)", borderRadius: "3px",
          fontSize: "12px", fontWeight: 600, color: "#fb923c",
          display: "flex", flexDirection: "column", gap: "2px",
        }}>
          <span style={{ fontSize: "9px", opacity: 0.6, textTransform: "uppercase", letterSpacing: "1px", fontFamily: "var(--font-mono)" }}>Side B</span>
          {debate.sideB}
        </div>
      </div>

      {/* Vote bar */}
      {isLive && (
        <div style={{ height: "2px", background: "var(--border2)", borderRadius: "2px", overflow: "hidden", marginBottom: "12px" }}>
          <div style={{
            height: "100%", width: `${voteW}%`,
            background: "linear-gradient(90deg, #3b82f6, #fb923c)",
            transition: "width 1.2s ease",
          }} />
        </div>
      )}

      {/* Footer */}
      <div style={{
        fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
        fontSize: "10px", color: isLive ? "var(--g)" : "var(--dim)",
        letterSpacing: "1.5px", textTransform: "uppercase",
      }}>
        {isLive ? `${debate.phase} →` : "Join Room →"}
      </div>
    </div>
  );
}

function StartDebateCard() {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      href="/create"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "#13131a" : "var(--card)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "40px 24px", textDecoration: "none",
        transition: "background 0.25s", cursor: "pointer",
        border: `1px dashed ${hovered ? "var(--g)" : "var(--border2)"}`,
        gap: "16px",
      }}
    >
      <div style={{
        width: "48px", height: "48px", border: `1px solid ${hovered ? "var(--g)" : "var(--border2)"}`,
        borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "24px", color: hovered ? "var(--g)" : "var(--dim)", transition: "all 0.25s",
      }}>+</div>
      <div style={{
        fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
        fontSize: "16px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "2px",
        color: hovered ? "var(--g)" : "var(--dim)", transition: "color 0.25s",
      }}>Start A Debate</div>
      <div style={{
        fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
        fontSize: "10px", color: "var(--dim)", letterSpacing: "1.5px",
        textTransform: "uppercase", textAlign: "center",
      }}>
        Challenge someone now
      </div>
    </Link>
  );
}

export default function LiveDebatesGrid() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, i) => {
          if (entry.isIntersecting) setTimeout(() => entry.target.classList.add("on"), i * 80);
        });
      },
      { threshold: 0.1 }
    );
    ref.current?.querySelectorAll(".rv").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <div style={{ background: "var(--dark)", padding: "100px 0" }}>
      <div ref={ref} id="debates" style={{ padding: "0 40px", maxWidth: "1400px", margin: "0 auto" }}>

        {/* Section header */}
        <div className="rv" style={{
          display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "40px",
        }}>
          <div>
            <div className="sec-label">Right Now</div>
            <h2 style={{
              fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
              fontSize: "clamp(36px, 4vw, 56px)", fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "-1px", lineHeight: 1,
            }}>Live Debates</h2>
          </div>
          <Link href="/browse" style={{
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase",
            color: "var(--dim)", textDecoration: "none",
            display: "flex", alignItems: "center", gap: "6px",
            paddingBottom: "4px", borderBottom: "1px solid var(--border2)",
            transition: "color 0.2s",
          }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--g)"; e.currentTarget.style.borderColor = "var(--g)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--dim)"; e.currentTarget.style.borderColor = "var(--border2)"; }}
          >
            View all debates →
          </Link>
        </div>

        {/* Grid */}
        <div className="rv" style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "1px",
          background: "var(--border)",
          border: "1px solid var(--border)",
        }}>
          {DEBATES.map((d) => <DebateCard key={d.id} debate={d} />)}
          <StartDebateCard />
        </div>
      </div>
    </div>
  );
}
