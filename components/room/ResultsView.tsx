"use client";

import { useState } from "react";
import Link from "next/link";
import type { ResultsData } from "@/types/socket";

export default function ResultsView({
  results,
  sideALabel,
  sideBLabel,
}: {
  results: ResultsData;
  sideALabel: string;
  sideBLabel: string;
}) {
  const [hovered, setHovered] = useState(false);
  const total = results.votesA + results.votesB;
  const pctA = total > 0 ? Math.round((results.votesA / total) * 100) : 50;
  const pctB = 100 - pctA;

  const winnerName =
    results.result === "side_a"
      ? results.debaterA.username
      : results.result === "side_b"
      ? results.debaterB.username
      : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 40px" }}>
      {/* Label */}
      <div
        style={{
          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
          fontSize: "10px",
          letterSpacing: "3px",
          textTransform: "uppercase",
          color: "var(--g)",
          marginBottom: "20px",
        }}
      >
        {results.result === "draw" ? "Debate Result" : "Winner"}
      </div>

      {/* Winner name or Draw */}
      <div
        style={{
          fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)",
          fontSize: "clamp(48px, 8vw, 96px)",
          fontWeight: 900,
          lineHeight: 0.9,
          letterSpacing: "-2px",
          textTransform: "uppercase",
          color: "var(--text)",
          marginBottom: "32px",
          textAlign: "center",
        }}
      >
        {winnerName ?? "Draw"}
      </div>

      {/* Vote bar */}
      <div style={{ width: "100%", maxWidth: "500px", marginBottom: "36px" }}>
        <div
          style={{
            height: "5px",
            background: "var(--border2)",
            borderRadius: "3px",
            overflow: "hidden",
            marginBottom: "10px",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${pctA}%`,
              background: "linear-gradient(90deg, #3b82f6, #fb923c)",
              transition: "width 1s ease",
            }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span
            style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "11px",
              fontWeight: 700,
              color: "#60a5fa",
            }}
          >
            {sideALabel} {pctA}% ({results.votesA})
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "11px",
              fontWeight: 700,
              color: "#fb923c",
            }}
          >
            {pctB}% ({results.votesB}) {sideBLabel}
          </span>
        </div>
      </div>

      {/* Elo changes */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", width: "100%", maxWidth: "500px", marginBottom: "40px" }}>
        <EloCard
          username={results.debaterA.username}
          newElo={results.debaterA.newElo}
          eloChange={results.result === "side_a" ? results.eloChange : results.result === "draw" ? 0 : -results.eloChange}
          color="#3b82f6"
          sideLabel={sideALabel}
        />
        <EloCard
          username={results.debaterB.username}
          newElo={results.debaterB.newElo}
          eloChange={results.result === "side_b" ? results.eloChange : results.result === "draw" ? 0 : -results.eloChange}
          color="#fb923c"
          sideLabel={sideBLabel}
        />
      </div>

      {/* Back to rooms */}
      <Link
        href="/rooms"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          textDecoration: "none",
          background: hovered ? "var(--g2)" : "var(--g)",
          padding: "14px 36px",
          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
          fontSize: "11px",
          fontWeight: 700,
          letterSpacing: "3px",
          textTransform: "uppercase",
          color: "var(--dark)",
          transition: "background 0.2s",
        }}
      >
        Back to Rooms
      </Link>
    </div>
  );
}

function EloCard({
  username,
  newElo,
  eloChange,
  color,
  sideLabel,
}: {
  username: string;
  newElo: number;
  eloChange: number;
  color: string;
  sideLabel: string;
}) {
  const isPositive = eloChange > 0;
  const changeColor = eloChange === 0 ? "var(--dim)" : isPositive ? "var(--g)" : "var(--red)";
  const changePrefix = isPositive ? "+" : "";

  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "8px",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
          fontSize: "8px",
          letterSpacing: "2px",
          textTransform: "uppercase",
          color,
          opacity: 0.7,
        }}
      >
        {sideLabel}
      </span>
      <span
        style={{
          fontFamily: "var(--font-body, 'Familjen Grotesk', sans-serif)",
          fontSize: "15px",
          fontWeight: 600,
          color: "var(--text)",
        }}
      >
        {username}
      </span>
      <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
        <span
          style={{
            fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
            fontSize: "24px",
            fontWeight: 700,
            color: "var(--text)",
          }}
        >
          {newElo}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "12px",
            fontWeight: 700,
            color: changeColor,
          }}
        >
          {changePrefix}{eloChange}
        </span>
      </div>
    </div>
  );
}
