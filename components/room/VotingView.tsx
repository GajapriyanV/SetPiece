"use client";

import { useState } from "react";
import { useServerTimer } from "@/hooks/useServerTimer";
import type { Side } from "@/types/socket";

export default function VotingView({
  sideALabel,
  sideBLabel,
  votes,
  voteWindowEndsAt,
  myVote,
  onVote,
  isDebater = false,
}: {
  sideALabel: string;
  sideBLabel: string;
  votes: { a: number; b: number } | null;
  voteWindowEndsAt: number | null;
  myVote: Side | null;
  onVote: (side: Side) => void;
  isDebater?: boolean;
}) {
  const secondsLeft = useServerTimer(voteWindowEndsAt);
  const total = (votes?.a ?? 0) + (votes?.b ?? 0);
  const pctA = total > 0 ? Math.round(((votes?.a ?? 0) / total) * 100) : 50;
  const pctB = 100 - pctA;

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
          marginBottom: "24px",
        }}
      >
        Cast Your Vote
      </div>

      {/* Timer */}
      <div
        style={{
          fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)",
          fontSize: "clamp(48px, 8vw, 80px)",
          fontWeight: 900,
          lineHeight: 0.9,
          color: secondsLeft <= 10 ? "var(--red)" : "var(--text)",
          marginBottom: "36px",
        }}
      >
        0:{String(secondsLeft).padStart(2, "0")}
      </div>

      {/* Vote buttons — hidden for debaters */}
      {isDebater ? (
        <div
          style={{
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "10px",
            letterSpacing: "2px",
            textTransform: "uppercase",
            color: "var(--dim)",
            marginBottom: "36px",
          }}
        >
          Waiting for votes
        </div>
      ) : (
        <div className="r-vote-buttons" style={{ width: "100%", maxWidth: "500px", marginBottom: "36px" }}>
          <VoteButton
            label={sideALabel}
            sideLabel="Side A"
            color="#3b82f6"
            selected={myVote === "a"}
            disabled={myVote !== null}
            onClick={() => onVote("a")}
          />
          <VoteButton
            label={sideBLabel}
            sideLabel="Side B"
            color="#fb923c"
            selected={myVote === "b"}
            disabled={myVote !== null}
            onClick={() => onVote("b")}
          />
        </div>
      )}

      {/* Vote bar */}
      <div style={{ width: "100%", maxWidth: "500px" }}>
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
              transition: "width 1.5s ease",
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
            {sideALabel} {pctA}%
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "11px",
              color: "var(--dim)",
            }}
          >
            {total} votes
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "11px",
              fontWeight: 700,
              color: "#fb923c",
            }}
          >
            {pctB}% {sideBLabel}
          </span>
        </div>
      </div>

      {myVote && (
        <div
          style={{
            marginTop: "24px",
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "10px",
            letterSpacing: "2px",
            textTransform: "uppercase",
            color: "var(--g)",
          }}
        >
          Vote cast — waiting for results
        </div>
      )}
    </div>
  );
}

function VoteButton({
  label,
  sideLabel,
  color,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  sideLabel: string;
  color: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: selected
          ? `${color}20`
          : hovered && !disabled
          ? `${color}10`
          : "var(--card)",
        border: `2px solid ${selected ? color : "var(--border)"}`,
        padding: "28px 20px",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled && !selected ? 0.4 : 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "8px",
        transition: "all 0.2s",
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
          fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
          fontSize: "18px",
          fontWeight: 700,
          color,
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      {selected && (
        <span
          style={{
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "9px",
            color: "var(--g)",
            letterSpacing: "1px",
          }}
        >
          ✓ Voted
        </span>
      )}
    </button>
  );
}
