"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import SignInModal from "@/components/auth/SignInModal";
import type { User } from "@supabase/supabase-js";

interface Room {
  roomId: string;
  topic: string;
  sideALabel: string;
  sideBLabel: string;
  status: "lobby" | "side_pick" | "live" | "voting" | "results";
  memberCount: number;
  isFeatured: boolean;
}

const STATUS_PRIORITY: Record<Room["status"], number> = {
  live: 0, voting: 1, side_pick: 2, lobby: 3, results: 4,
};

const STATUS_LABEL: Record<Room["status"], string> = {
  live: "Live Now",
  voting: "Voting",
  side_pick: "Picking Sides",
  lobby: "In Lobby",
  results: "Finished",
};

function DebateCard({ room }: { room: Room }) {
  const [hovered, setHovered] = useState(false);
  const isActive = room.status === "live" || room.status === "voting";
  const borderColor = isActive ? "var(--g)" : "var(--border)";
  const dotColor = isActive ? "var(--red)" : "var(--dim)";

  return (
    <Link
      href={`/rooms/${room.roomId}`}
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
        textDecoration: "none",
      }}
    >
      {/* Status row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "6px",
          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
          fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase",
          color: dotColor,
        }}>
          <div className={isActive ? "status-dot-live" : ""} style={{
            width: "5px", height: "5px", borderRadius: "50%", background: "currentColor", flexShrink: 0,
          }} />
          {STATUS_LABEL[room.status]}
        </div>
        <span style={{
          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
          fontSize: "10px", color: "var(--dim)", letterSpacing: "1px",
        }}>
          {room.memberCount} {isActive ? "watching" : "in room"}
        </span>
      </div>

      {/* Topic */}
      <div style={{
        fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
        fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px",
        fontSize: "clamp(16px, 1.4vw, 22px)", lineHeight: 1.1,
        marginBottom: "20px", flex: 1,
        color: "var(--text)",
      }}>
        {room.topic}
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
          {room.sideALabel}
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
          {room.sideBLabel}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
        fontSize: "10px", color: isActive ? "var(--g)" : "var(--dim)",
        letterSpacing: "1.5px", textTransform: "uppercase",
      }}>
        {isActive ? "Watch Debate →" : "Join Room →"}
      </div>
    </Link>
  );
}

function LoadingCard() {
  return (
    <div style={{
      background: "var(--card)",
      borderLeft: "2px solid var(--border)",
      padding: "24px",
      display: "flex", flexDirection: "column", gap: "12px",
      minHeight: "200px",
    }}>
      <div style={{ width: "80px", height: "10px", background: "var(--border2)", borderRadius: "2px" }} />
      <div style={{ width: "100%", height: "22px", background: "var(--border2)", borderRadius: "2px", marginTop: "4px" }} />
      <div style={{ width: "70%", height: "22px", background: "var(--border2)", borderRadius: "2px" }} />
      <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
        <div style={{ flex: 1, height: "52px", background: "var(--border2)", borderRadius: "3px" }} />
        <div style={{ width: "24px" }} />
        <div style={{ flex: 1, height: "52px", background: "var(--border2)", borderRadius: "3px" }} />
      </div>
    </div>
  );
}

function EmptyCard({ onStart }: { onStart: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div style={{
      gridColumn: "1 / -1",
      background: "var(--card)",
      padding: "60px 24px",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "20px",
    }}>
      <div style={{
        fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
        fontSize: "20px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px",
        color: "var(--dim)",
      }}>No live debates right now</div>
      <button
        onClick={onStart}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
          fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase",
          color: hovered ? "var(--g)" : "var(--dim)",
          background: "none", border: "none", cursor: "pointer",
          borderBottom: `1px solid ${hovered ? "var(--g)" : "var(--border2)"}`,
          paddingBottom: "3px",
          transition: "color 0.2s, border-color 0.2s",
        }}
      >
        Start a debate now →
      </button>
    </div>
  );
}

function MoreCard({ onClick, span }: { onClick: () => void; span: number }) {
  const [hovered, setHovered] = useState(false);
  const wide = span > 1;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        gridColumn: span > 1 ? `span ${span}` : undefined,
        background: hovered ? "#13131a" : "var(--card)",
        display: "flex",
        flexDirection: wide ? "row" : "column",
        alignItems: "center",
        justifyContent: wide ? "space-between" : "center",
        padding: wide ? "28px 40px" : "40px 24px",
        transition: "background 0.25s", cursor: "pointer",
        border: `1px dashed ${hovered ? "var(--g)" : "var(--border2)"}`,
        gap: wide ? "0" : "16px",
      }}
    >
      {wide ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
            <div style={{
              width: "36px", height: "36px", border: `1px solid ${hovered ? "var(--g)" : "var(--border2)"}`,
              borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "16px", color: hovered ? "var(--g)" : "var(--dim)", transition: "all 0.25s",
              letterSpacing: "2px", flexShrink: 0,
            }}>···</div>
            <div>
              <div style={{
                fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
                fontSize: "16px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "2px",
                color: hovered ? "var(--g)" : "var(--dim)", transition: "color 0.25s",
              }}>More Rooms</div>
              <div style={{
                fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                fontSize: "10px", color: "var(--dim)", letterSpacing: "1.5px",
                textTransform: "uppercase", marginTop: "4px",
              }}>Browse all live debates</div>
            </div>
          </div>
          <div style={{
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "11px", color: hovered ? "var(--g)" : "var(--dim)",
            letterSpacing: "2px", textTransform: "uppercase", transition: "color 0.25s",
          }}>View all →</div>
        </>
      ) : (
        <>
          <div style={{
            width: "48px", height: "48px", border: `1px solid ${hovered ? "var(--g)" : "var(--border2)"}`,
            borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "20px", color: hovered ? "var(--g)" : "var(--dim)", transition: "all 0.25s",
            letterSpacing: "2px",
          }}>···</div>
          <div style={{
            fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
            fontSize: "16px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "2px",
            color: hovered ? "var(--g)" : "var(--dim)", transition: "color 0.25s",
          }}>More Rooms</div>
          <div style={{
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "10px", color: "var(--dim)", letterSpacing: "1.5px",
            textTransform: "uppercase", textAlign: "center",
          }}>Browse all live debates</div>
        </>
      )}
    </div>
  );
}

export default function LiveDebatesGrid() {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [showSignIn, setShowSignIn] = useState(false);
  const [rooms, setRooms] = useState<Room[] | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_SOCKET_URL}/api/rooms`)
      .then((r) => r.json())
      .then((data: Room[]) => {
        const sorted = data
          .filter((r) => r.status !== "results")
          .sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]);
        setRooms(sorted.slice(0, 5));
      })
      .catch(() => setRooms([]));
  }, []);

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
  }, [rooms]);

  const handleMoreRooms = () => {
    if (user) {
      router.push("/rooms");
    } else {
      setShowSignIn(true);
    }
  };

  const handleStartDebate = () => {
    if (user) {
      router.push("/rooms");
    } else {
      setShowSignIn(true);
    }
  };

  // Calculate how many columns MoreCard should span so the grid has no empty cells.
  // Grid is 3 columns. total = rooms + 1 (for MoreCard). remainder tells us leftovers in last row.
  const moreCardSpan = (() => {
    if (!rooms || rooms.length === 0) return 1;
    const total = rooms.length + 1;
    const remainder = total % 3;
    if (remainder === 0) return 1;
    if (remainder === 1) return 3;
    return 2; // remainder === 2
  })();

  return (
    <>
      {showSignIn && <SignInModal onClose={() => setShowSignIn(false)} />}

      <div id="debates" className="r-section-pad" style={{ background: "var(--dark)", padding: "100px 0", scrollMarginTop: "60px" }}>
        <div ref={ref} className="r-pad" style={{ maxWidth: "1400px", margin: "0 auto" }}>

          {/* Section header */}
          <div className="rv" style={{ marginBottom: "40px" }}>
            <div className="sec-label">Right Now</div>
            <h2 style={{
              fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
              fontSize: "clamp(36px, 4vw, 56px)", fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "-1px", lineHeight: 1,
            }}>Live Debates</h2>
          </div>

          {/* Grid */}
          <div className="rv r-debates-grid" style={{
            background: "var(--border)",
            border: "1px solid var(--border)",
          }}>
            {rooms === null ? (
              Array.from({ length: 3 }).map((_, i) => <LoadingCard key={i} />)
            ) : rooms.length === 0 ? (
              <EmptyCard onStart={handleStartDebate} />
            ) : (
              <>
                {rooms.map((r) => <DebateCard key={r.roomId} room={r} />)}
                <MoreCard onClick={handleMoreRooms} span={moreCardSpan} />
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
