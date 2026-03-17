"use client";

import { useState } from "react";
import type { RoomMember, Side, UserBrief } from "@/types/socket";

export default function LobbyView({
  topic,
  sideALabel,
  sideBLabel,
  members,
  debaterA,
  debaterB,
  currentUserId,
  onPickSide,
  onUnpickSide,
  onReady,
}: {
  topic: string;
  sideALabel: string;
  sideBLabel: string;
  members: RoomMember[];
  debaterA: UserBrief | null;
  debaterB: UserBrief | null;
  currentUserId: string;
  onPickSide: (side: Side) => void;
  onUnpickSide: () => void;
  onReady: () => void;
}) {
  const myMember = members.find((m) => m.userId === currentUserId);
  const mySide = myMember?.side ?? null;
  const amDebater = debaterA?.userId === currentUserId || debaterB?.userId === currentUserId;
  const isReady = myMember?.isReady ?? false;

  const spectators = members.filter(
    (m) => m.userId !== debaterA?.userId && m.userId !== debaterB?.userId
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 40px" }}>
      {/* Topic */}
      <div
        style={{
          fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
          fontSize: "clamp(28px, 4vw, 48px)",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "-1px",
          lineHeight: 1.05,
          textAlign: "center",
          maxWidth: "700px",
          marginBottom: "40px",
        }}
      >
        {topic}
      </div>

      {/* Side pick buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "24px", width: "100%", maxWidth: "600px", marginBottom: "40px" }}>
        <SideButton
          label={sideALabel}
          sideLabel="Side A"
          color="#3b82f6"
          picked={mySide === "a"}
          takenBy={debaterA}
          disabled={!!debaterA && debaterA.userId !== currentUserId}
          onClick={() => mySide === "a" ? onUnpickSide() : onPickSide("a")}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
            fontSize: "16px",
            fontWeight: 700,
            color: "var(--dim)",
            letterSpacing: "3px",
          }}
        >
          VS
        </div>
        <SideButton
          label={sideBLabel}
          sideLabel="Side B"
          color="#fb923c"
          picked={mySide === "b"}
          takenBy={debaterB}
          disabled={!!debaterB && debaterB.userId !== currentUserId}
          onClick={() => mySide === "b" ? onUnpickSide() : onPickSide("b")}
        />
      </div>

      {/* Ready button */}
      {amDebater && !isReady && (
        <ReadyButton onClick={onReady} />
      )}

      {amDebater && isReady && (
        <div
          style={{
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "11px",
            letterSpacing: "2px",
            textTransform: "uppercase",
            color: "var(--g)",
            marginBottom: "32px",
          }}
        >
          Ready — Waiting for opponent
        </div>
      )}

      {!amDebater && (debaterA || debaterB) && (
        <div
          style={{
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "11px",
            letterSpacing: "2px",
            textTransform: "uppercase",
            color: "var(--dim)",
            marginBottom: "32px",
          }}
        >
          Waiting for debaters to ready up...
        </div>
      )}

      {/* Spectators */}
      {spectators.length > 0 && (
        <div style={{ width: "100%", maxWidth: "600px" }}>
          <div
            style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "9px",
              letterSpacing: "2.5px",
              textTransform: "uppercase",
              color: "var(--dim)",
              marginBottom: "12px",
            }}
          >
            Spectators ({spectators.length})
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {spectators.map((s) => (
              <div
                key={s.userId}
                style={{
                  padding: "6px 12px",
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  fontFamily: "var(--font-body, 'Familjen Grotesk', sans-serif)",
                  fontSize: "12px",
                  color: "var(--text)",
                  borderRadius: "2px",
                }}
              >
                {s.username}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SideButton({
  label,
  sideLabel,
  color,
  picked,
  takenBy,
  disabled,
  onClick,
}: {
  label: string;
  sideLabel: string;
  color: string;
  picked: boolean;
  takenBy: UserBrief | null;
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
        background: picked
          ? `${color}15`
          : hovered && !disabled
          ? `${color}0a`
          : "var(--card)",
        border: `1px solid ${picked ? color : "var(--border)"}`,
        padding: "24px 20px",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
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
          color: color,
          opacity: 0.7,
        }}
      >
        {sideLabel}
      </span>
      <span
        style={{
          fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
          fontSize: "16px",
          fontWeight: 700,
          color: color,
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      {takenBy && (
        <span
          style={{
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "9px",
            color: "var(--dim)",
            letterSpacing: "1px",
          }}
        >
          {picked ? "You" : takenBy.username}
        </span>
      )}
    </button>
  );
}

function ReadyButton({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "var(--g2)" : "var(--g)",
        border: "none",
        padding: "14px 40px",
        cursor: "pointer",
        fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
        fontSize: "12px",
        fontWeight: 700,
        letterSpacing: "3px",
        textTransform: "uppercase",
        color: "var(--dark)",
        marginBottom: "32px",
        transition: "background 0.2s",
      }}
    >
      Ready Up
    </button>
  );
}
