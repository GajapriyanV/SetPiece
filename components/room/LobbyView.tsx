"use client";

import { useState, useEffect } from "react";
import type { RoomMember, Side, UserBrief, FeaturedMetaBrief } from "@/types/socket";

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
  onVoteSkip,
  isFeatured,
  featuredMeta,
  sidePickEndsAt,
  skipVotes,
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
  onVoteSkip: () => void;
  isFeatured?: boolean;
  featuredMeta?: FeaturedMetaBrief | null;
  sidePickEndsAt?: number | null;
  skipVotes?: { count: number; required: number; votedUserIds: string[] } | null;
}) {
  const myMember = members.find((m) => m.userId === currentUserId);
  const mySide = myMember?.side ?? null;
  const amDebater = debaterA?.userId === currentUserId || debaterB?.userId === currentUserId;
  const isReady = myMember?.isReady ?? false;

  const spectators = members.filter(
    (m) => m.userId !== debaterA?.userId && m.userId !== debaterB?.userId
  );

  // Side-pick countdown for featured rooms
  const [sidePickRemaining, setSidePickRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (!sidePickEndsAt) { setSidePickRemaining(null); return; }
    function tick() {
      const left = Math.max(0, Math.ceil((sidePickEndsAt! - Date.now()) / 1000));
      setSidePickRemaining(left);
    }
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [sidePickEndsAt]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 40px" }}>
      {/* Featured room indicators */}
      {isFeatured && featuredMeta && (
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px" }}>
          <span
            style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "9px",
              letterSpacing: "2px",
              textTransform: "uppercase",
              color: "var(--dim)",
            }}
          >
            Topic {featuredMeta.currentTopicIndex + 1} of {featuredMeta.topicCount}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "9px",
              letterSpacing: "2px",
              textTransform: "uppercase",
              color: "var(--g)",
            }}
          >
            {featuredMeta.debatesCompleted}/{featuredMeta.maxDebates} Debates
          </span>
        </div>
      )}

      {/* Side-pick countdown */}
      {isFeatured && sidePickRemaining != null && sidePickRemaining > 0 && (
        <div
          style={{
            fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)",
            fontSize: "clamp(32px, 5vw, 56px)",
            fontWeight: 900,
            color: sidePickRemaining <= 10 ? "var(--red)" : "var(--g)",
            lineHeight: 1,
            marginBottom: "12px",
          }}
        >
          {sidePickRemaining}s
        </div>
      )}
      {isFeatured && sidePickRemaining != null && sidePickRemaining > 0 && (
        <div
          style={{
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "9px",
            letterSpacing: "2px",
            textTransform: "uppercase",
            color: "var(--dim)",
            marginBottom: "20px",
          }}
        >
          Pick a side before time runs out
        </div>
      )}

      {/* Topic */}
      <div
        style={{
          fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)",
          fontSize: "clamp(40px, 6vw, 72px)",
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "-2px",
          lineHeight: 0.92,
          textAlign: "center",
          maxWidth: "800px",
          marginBottom: "48px",
        }}
      >
        {topic}
      </div>

      {/* Side pick buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "28px", width: "100%", maxWidth: "720px", marginBottom: "44px" }}>
        <SideButton
          label={sideALabel}
          sideLabel="Side A"
          color="#3b82f6"
          picked={mySide === "a"}
          takenBy={debaterA}
          isReady={!!members.find((m) => m.side === "a" && m.isReady)}
          disabled={!!debaterA && debaterA.userId !== currentUserId}
          onClick={() => mySide === "a" ? onUnpickSide() : onPickSide("a")}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)",
            fontSize: "28px",
            fontWeight: 900,
            color: "var(--dim)",
            letterSpacing: "4px",
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
          isReady={!!members.find((m) => m.side === "b" && m.isReady)}
          disabled={!!debaterB && debaterB.userId !== currentUserId}
          onClick={() => mySide === "b" ? onUnpickSide() : onPickSide("b")}
        />
      </div>

      {/* Skip topic button (featured rooms only, requires 2 votes) */}
      {isFeatured && !!sidePickEndsAt && sidePickRemaining != null && sidePickRemaining > 0 && (
        <SkipTopicButton
          onVoteSkip={onVoteSkip}
          skipVotes={skipVotes}
          currentUserId={currentUserId}
        />
      )}

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
  isReady,
  disabled,
  onClick,
}: {
  label: string;
  sideLabel: string;
  color: string;
  picked: boolean;
  takenBy: UserBrief | null;
  isReady: boolean;
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
        padding: "40px 28px",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "10px",
        transition: "all 0.2s",
        minHeight: "140px",
        justifyContent: "center",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
          fontSize: "10px",
          letterSpacing: "3px",
          textTransform: "uppercase",
          color: color,
          opacity: 0.7,
        }}
      >
        {sideLabel}
      </span>
      <span
        style={{
          fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)",
          fontSize: "clamp(24px, 3vw, 36px)",
          fontWeight: 900,
          color: color,
          textTransform: "uppercase",
          letterSpacing: "-1px",
          lineHeight: 1,
        }}
      >
        {label}
      </span>
      {takenBy && (
        <span
          style={{
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "11px",
            color: "var(--dim)",
            letterSpacing: "1px",
            marginTop: "4px",
          }}
        >
          {picked ? "You" : takenBy.username}
        </span>
      )}
      {takenBy && isReady && (
        <span
          style={{
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "9px",
            letterSpacing: "2px",
            textTransform: "uppercase",
            color: "var(--g)",
            marginTop: "2px",
          }}
        >
          Ready
        </span>
      )}
    </button>
  );
}

function SkipTopicButton({
  onVoteSkip,
  skipVotes,
  currentUserId,
}: {
  onVoteSkip: () => void;
  skipVotes?: { count: number; required: number; votedUserIds: string[] } | null;
  currentUserId: string;
}) {
  const [hovered, setHovered] = useState(false);
  const hasVoted = skipVotes?.votedUserIds.includes(currentUserId) ?? false;
  const count = skipVotes?.count ?? 0;
  const required = skipVotes?.required ?? 2;

  return (
    <button
      onClick={onVoteSkip}
      disabled={hasVoted}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hasVoted ? "var(--dark3)" : hovered ? "var(--dark3)" : "transparent",
        border: `1px solid ${hasVoted ? "var(--dim)" : "var(--border2)"}`,
        padding: "10px 28px",
        cursor: hasVoted ? "default" : "pointer",
        fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
        fontSize: "10px",
        fontWeight: 600,
        letterSpacing: "2px",
        textTransform: "uppercase",
        color: hasVoted ? "var(--dim)" : hovered ? "var(--text)" : "var(--dim)",
        marginBottom: "24px",
        transition: "all 0.2s",
        opacity: hasVoted ? 0.6 : 1,
      }}
    >
      {hasVoted ? `Voted to skip (${count}/${required})` : `Skip topic (${count}/${required})`}
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
