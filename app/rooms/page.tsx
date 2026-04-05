"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import CreateRoomModal from "@/components/room/CreateRoomModal";
import CreateFeaturedRoomModal from "@/components/room/CreateFeaturedRoomModal";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

interface RoomListItem {
  roomId: string;
  topic: string;
  sideALabel: string;
  sideBLabel: string;
  status: string;
  memberCount: number;
  isFeatured?: boolean;
  debatesCompleted?: number;
  maxDebates?: number;
}

function RoomRow({ room }: { room: RoomListItem }) {
  const [hovered, setHovered] = useState(false);
  const isLive = room.status === "live" || room.status === "voting";
  const isOpen = room.status === "lobby" || room.status === "side_pick";

  return (
    <Link
      href={`/rooms/${room.roomId}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="r-room-row"
      style={{
        textDecoration: "none",
        color: "inherit",
        background: hovered ? "#13131a" : "var(--card)",
        borderLeft: `2px solid ${isLive ? "var(--red)" : isOpen ? "var(--g)" : "var(--border)"}`,
        padding: "24px 32px",
        alignItems: "center",
        gap: "24px",
        transition: "background 0.25s",
        cursor: "pointer",
      }}
    >
      {/* Status */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "10px",
            letterSpacing: "1.5px",
            textTransform: "uppercase",
            color: isLive ? "var(--red)" : "var(--g)",
          }}
        >
          <div
            className={isLive ? "status-dot-live" : ""}
            style={{
              width: "5px",
              height: "5px",
              borderRadius: "50%",
              background: "currentColor",
              flexShrink: 0,
            }}
          />
          {isLive ? "Live Now" : isOpen ? "Open" : room.status}
        </div>
        {room.isFeatured && (
          <span
            style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "8px",
              letterSpacing: "2px",
              textTransform: "uppercase",
              color: "var(--g)",
              background: "var(--g3)",
              padding: "2px 6px",
              display: "inline-block",
            }}
          >
            Featured {room.debatesCompleted != null ? `${room.debatesCompleted}/${room.maxDebates}` : ""}
          </span>
        )}
        <span
          style={{
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "10px",
            color: "var(--dim)",
            letterSpacing: "1px",
          }}
        >
          {room.memberCount} {room.memberCount === 1 ? "member" : "members"}
        </span>
      </div>

      {/* Topic */}
      <div
        style={{
          fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          fontSize: "clamp(15px, 1.2vw, 20px)",
          lineHeight: 1.15,
        }}
      >
        {room.topic}
      </div>

      {/* Sides */}
      <div className="r-room-sides" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div
          style={{
            flex: 1,
            padding: "6px 10px",
            background: "rgba(59,130,246,0.08)",
            border: "1px solid rgba(59,130,246,0.2)",
            borderRadius: "3px",
            fontSize: "11px",
            fontWeight: 600,
            color: "#60a5fa",
            display: "flex",
            flexDirection: "column",
            gap: "1px",
          }}
        >
          <span
            style={{
              fontSize: "8px",
              opacity: 0.6,
              textTransform: "uppercase",
              letterSpacing: "1px",
              fontFamily: "var(--font-mono)",
            }}
          >
            Side A
          </span>
          {room.sideALabel}
        </div>
        <span
          style={{
            fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
            fontSize: "11px",
            fontWeight: 700,
            color: "var(--dim)",
            letterSpacing: "2px",
          }}
        >
          VS
        </span>
        <div
          style={{
            flex: 1,
            padding: "6px 10px",
            background: "rgba(251,146,60,0.08)",
            border: "1px solid rgba(251,146,60,0.2)",
            borderRadius: "3px",
            fontSize: "11px",
            fontWeight: 600,
            color: "#fb923c",
            display: "flex",
            flexDirection: "column",
            gap: "1px",
          }}
        >
          <span
            style={{
              fontSize: "8px",
              opacity: 0.6,
              textTransform: "uppercase",
              letterSpacing: "1px",
              fontFamily: "var(--font-mono)",
            }}
          >
            Side B
          </span>
          {room.sideBLabel}
        </div>
      </div>

      {/* Phase / CTA */}
      <div
        style={{
          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
          fontSize: "10px",
          color: isLive ? "var(--g)" : "var(--dim)",
          letterSpacing: "1.5px",
          textTransform: "uppercase",
          textAlign: "right",
          whiteSpace: "nowrap",
        }}
      >
        {isLive ? "Watch Live →" : "Join Room →"}
      </div>
    </Link>
  );
}

export default function RoomsPage() {
  const ref = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<"all" | "live" | "open">("all");
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showFeaturedCreate, setShowFeaturedCreate] = useState(false);
  const [createHovered, setCreateHovered] = useState(false);
  const [featuredHovered, setFeaturedHovered] = useState(false);

  // Fetch rooms on mount + polling
  useEffect(() => {
    async function fetchRooms() {
      try {
        const res = await fetch(`${SOCKET_URL}/api/rooms`);
        if (res.ok) {
          const data = await res.json();
          setRooms(data);
        }
      } catch {
        // Server might not be running
      } finally {
        setLoading(false);
      }
    }

    fetchRooms();
    const id = setInterval(fetchRooms, 7000);
    return () => clearInterval(id);
  }, []);

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
  }, [loading, rooms.length]);

  const filtered = rooms.filter((r) => {
    if (filter === "all") return true;
    if (filter === "live") return r.status === "live" || r.status === "voting";
    if (filter === "open") return r.status === "lobby" || r.status === "side_pick";
    return true;
  });

  return (
    <main style={{ background: "var(--dark)", minHeight: "100vh", paddingTop: "80px" }}>
      <div ref={ref} className="r-pad" style={{ maxWidth: "1100px", margin: "0 auto", paddingTop: "60px", paddingBottom: "60px" }}>
        {/* Header */}
        <div className="rv" style={{ marginBottom: "48px" }}>
          <div className="sec-label">All Rooms</div>
          <div className="r-rooms-header" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "24px" }}>
            <h1
              style={{
                fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
                fontSize: "clamp(36px, 4vw, 64px)",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "-1px",
                lineHeight: 1,
                margin: 0,
              }}
            >
              Live Debates
            </h1>

            <div className="r-rooms-actions" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              {/* Filter tabs */}
              <div className="r-rooms-filters" style={{ display: "flex", gap: "1px", background: "var(--border)", border: "1px solid var(--border)" }}>
                {(["all", "live", "open"] as const).map((f) => (
                  <FilterTab
                    key={f}
                    label={f === "all" ? "All" : f === "live" ? "Live Now" : "Open"}
                    active={filter === f}
                    onClick={() => setFilter(f)}
                  />
                ))}
              </div>

              {/* Featured room button */}
              <button
                onClick={() => setShowFeaturedCreate(true)}
                onMouseEnter={() => setFeaturedHovered(true)}
                onMouseLeave={() => setFeaturedHovered(false)}
                className="r-rooms-btn-featured"
                style={{
                  background: "transparent",
                  border: `1px solid ${featuredHovered ? "var(--g)" : "var(--border)"}`,
                  padding: "10px 20px",
                  cursor: "pointer",
                  fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "2px",
                  textTransform: "uppercase",
                  color: featuredHovered ? "var(--g)" : "var(--dim)",
                  transition: "all 0.2s",
                }}
              >
                Featured Room
              </button>

              {/* Create room button */}
              <button
                onClick={() => setShowCreate(true)}
                onMouseEnter={() => setCreateHovered(true)}
                onMouseLeave={() => setCreateHovered(false)}
                style={{
                  background: createHovered ? "var(--g2)" : "var(--g)",
                  border: "none",
                  padding: "10px 20px",
                  cursor: "pointer",
                  fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "2px",
                  textTransform: "uppercase",
                  color: "var(--dark)",
                  transition: "background 0.2s",
                }}
              >
                + Create Room
              </button>
            </div>
          </div>
        </div>

        {/* Rooms list */}
        {loading ? (
          <div
            style={{
              textAlign: "center",
              padding: "80px 0",
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "11px",
              color: "var(--dim)",
              letterSpacing: "2px",
              textTransform: "uppercase",
            }}
          >
            Loading rooms...
          </div>
        ) : filtered.length > 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1px",
              background: "var(--border)",
              border: "1px solid var(--border)",
            }}
          >
            {filtered.map((r) => (
              <RoomRow key={r.roomId} room={r} />
            ))}
          </div>
        ) : (
          <div
            style={{
              textAlign: "center",
              padding: "80px 0",
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "11px",
              color: "var(--dim)",
              letterSpacing: "2px",
              textTransform: "uppercase",
            }}
          >
            {rooms.length === 0 ? "No rooms yet — create one to get started" : "No rooms found"}
          </div>
        )}
      </div>

      {showCreate && <CreateRoomModal onClose={() => setShowCreate(false)} />}
      {showFeaturedCreate && <CreateFeaturedRoomModal onClose={() => setShowFeaturedCreate(false)} />}
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
        border: "none",
        cursor: "pointer",
        fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
        fontSize: "10px",
        letterSpacing: "1.5px",
        textTransform: "uppercase",
        color: active ? "var(--g)" : hovered ? "var(--text)" : "var(--dim)",
        transition: "all 0.2s",
      }}
    >
      {label}
    </button>
  );
}
