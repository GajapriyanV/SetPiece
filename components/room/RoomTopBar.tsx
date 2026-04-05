"use client";

import { useState } from "react";
import type { RoomStatus, FeaturedMetaBrief } from "@/types/socket";

const STATUS_LABELS: Record<RoomStatus, string> = {
  lobby: "Open Lobby",
  side_pick: "Picking Sides",
  live: "In Progress",
  voting: "Voting",
  results: "Results",
};

export default function RoomTopBar({
  status,
  memberCount,
  onLeave,
  isFeatured,
  featuredMeta,
}: {
  status: RoomStatus;
  memberCount: number;
  onLeave: () => void;
  isFeatured?: boolean;
  featuredMeta?: FeaturedMetaBrief | null;
}) {
  const [hovered, setHovered] = useState(false);
  const isLive = status === "live" || status === "voting";

  return (
    <div
      className="r-pad"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: "52px",
        borderBottom: "1px solid var(--border)",
        background: "var(--dark2)",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
          fontSize: "10px",
          letterSpacing: "3px",
          textTransform: "uppercase",
          color: "var(--dim)",
        }}
      >
        {isFeatured ? "Featured Room" : "Live Debate Room"}
      </span>

      {isFeatured && featuredMeta && (
        <span
          style={{
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "9px",
            letterSpacing: "2px",
            textTransform: "uppercase",
            color: "var(--g)",
            background: "var(--g3)",
            padding: "3px 8px",
          }}
        >
          Debate {featuredMeta.debatesCompleted}/{featuredMeta.maxDebates}
        </span>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
        {/* Member count */}
        <span
          style={{
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "10px",
            letterSpacing: "1.5px",
            color: "var(--dim)",
          }}
        >
          {memberCount} {memberCount === 1 ? "member" : "members"}
        </span>

        {/* Status */}
        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
          <div
            className={isLive ? "status-dot-live" : ""}
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: isLive ? "var(--g)" : "var(--dim)",
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "10px",
              letterSpacing: "2.5px",
              textTransform: "uppercase",
              color: isLive ? "var(--g)" : "var(--dim)",
            }}
          >
            {STATUS_LABELS[status]}
          </span>
        </div>

        {/* Leave button */}
        <button
          onClick={onLeave}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            background: hovered ? "rgba(255,45,85,0.1)" : "transparent",
            border: `1px solid ${hovered ? "var(--red)" : "var(--border)"}`,
            padding: "6px 14px",
            cursor: "pointer",
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "9px",
            letterSpacing: "2px",
            textTransform: "uppercase",
            color: hovered ? "var(--red)" : "var(--dim)",
            transition: "all 0.2s",
          }}
        >
          Leave
        </button>
      </div>
    </div>
  );
}
