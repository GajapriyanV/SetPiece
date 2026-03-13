"use client";

import { useEffect, useRef, useState } from "react";

const PHASES = [
  { label: "Opening Statement", duration: 90 },
  { label: "Rebuttal Round", duration: 120 },
  { label: "Rebuttal Round", duration: 120 },
  { label: "Closing Argument", duration: 60 },
];

const MOCK_ROOM = {
  topic: "Who's The Better Generational Talent?",
  sideA: { name: "FootballIQ99", stance: "Haaland", avatar: "F", color: "#3b82f6" },
  sideB: { name: "MessiForever", stance: "Mbappé", avatar: "M", color: "#fb923c" },
  activeSide: "A" as "A" | "B",
  voteA: 58,
};

const MOCK_SPECTATORS = [
  { id: "1", name: "TacticsNerd", avatar: "T", color: "#8b5cf6" },
  { id: "2", name: "GoalMachine", avatar: "G", color: "#06b6d4" },
  { id: "3", name: "PressHigh99", avatar: "P", color: "#f59e0b" },
  { id: "4", name: "xGKing", avatar: "X", color: "#ec4899" },
  { id: "5", name: "LaBombonera", avatar: "L", color: "#10b981" },
  { id: "6", name: "UltrasFan", avatar: "U", color: "#3b82f6" },
  { id: "7", name: "DeepBlock", avatar: "D", color: "#f97316" },
  { id: "8", name: "Tifosi77", avatar: "T", color: "#6366f1" },
  { id: "9", name: "BallWatcher", avatar: "B", color: "#14b8a6" },
  { id: "10", name: "OffsideTrap", avatar: "O", color: "#e11d48" },
  { id: "11", name: "CurvaNote", avatar: "C", color: "#a855f7" },
  { id: "12", name: "FreeKickEra", avatar: "F", color: "#0ea5e9" },
];


function WaveformBars() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "3px", height: "24px" }}>
      {[0.6, 1, 0.7, 1, 0.5, 0.9, 0.6, 1, 0.75].map((h, i) => (
        <div
          key={i}
          style={{
            width: "3px",
            height: `${h * 100}%`,
            background: "var(--g)",
            borderRadius: "2px",
            animation: `wv 0.${5 + (i % 4)}s ease-in-out infinite alternate`,
            animationDelay: `${i * 0.08}s`,
          }}
        />
      ))}
    </div>
  );
}

function InactiveDots() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} style={{
          width: "5px", height: "5px", borderRadius: "50%",
          background: "var(--border2)",
        }} />
      ))}
    </div>
  );
}

export default function RoomPage() {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(PHASES[0].duration);
  const [voteA, setVoteA] = useState(MOCK_ROOM.voteA);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Countdown
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setPhaseIndex((p) => Math.min(p + 1, PHASES.length - 1));
          return PHASES[Math.min(phaseIndex + 1, PHASES.length - 1)].duration;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current!);
  }, [phaseIndex]);

  // Drift votes
  useEffect(() => {
    const id = setInterval(() => {
      setVoteA((v) => Math.max(40, Math.min(68, v + (Math.random() - 0.5) * 2)));
    }, 2800);
    return () => clearInterval(id);
  }, []);

  const phase = PHASES[phaseIndex];
  const phasePct = ((phase.duration - timeLeft) / phase.duration) * 100;
  const mm = Math.floor(timeLeft / 60);
  const ss = String(timeLeft % 60).padStart(2, "0");
  const voteB = 100 - Math.round(voteA);
  const voteARounded = Math.round(voteA);

  return (
    <main style={{ background: "var(--dark)", minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* Top bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 32px", height: "52px",
        borderBottom: "1px solid var(--border)",
        background: "var(--dark2)",
      }}>
        <span style={{
          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
          fontSize: "10px", letterSpacing: "3px", textTransform: "uppercase",
          color: "var(--dim)",
        }}>Live Debate Room</span>
        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
          <div className="status-dot-live" style={{
            width: "6px", height: "6px", borderRadius: "50%", background: "var(--g)",
          }} />
          <span style={{
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "10px", letterSpacing: "2.5px", textTransform: "uppercase",
            color: "var(--g)",
          }}>In Progress</span>
        </div>
      </div>

      {/* Main content */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "36px 40px 0" }}>

        {/* Phase label */}
        <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "10px", letterSpacing: "3px", textTransform: "uppercase", color: "var(--g)", marginBottom: "16px" }}>{phase.label}</div>

        {/* Segmented progress bar */}
        <div style={{ width: "100%", maxWidth: "600px", marginBottom: "24px", position: "relative" }}>
          <div style={{ display: "flex", gap: "4px" }}>
            {PHASES.map((_p, i) => (
              <div key={i} style={{ flex: 1, height: "3px", background: "var(--border2)", borderRadius: "2px", overflow: "hidden", position: "relative" }}>
                <div style={{ position: "absolute", inset: 0, background: "var(--g)", transformOrigin: "left", transform: i < phaseIndex ? "scaleX(1)" : i === phaseIndex ? `scaleX(${phasePct / 100})` : "scaleX(0)", transition: "transform 1s linear" }} />
              </div>
            ))}
          </div>
          <div style={{ position: "absolute", top: "50%", left: `calc(${(phaseIndex / PHASES.length) * 100 + (phasePct / 100) * (100 / PHASES.length)}% - 6px)`, transform: "translateY(-50%)", width: "12px", height: "12px", borderRadius: "50%", border: "2px solid var(--g)", background: "var(--dark)", transition: "left 1s linear" }} />
        </div>

        {/* Timer */}
        <div style={{ fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)", fontSize: "clamp(64px, 10vw, 108px)", fontWeight: 900, lineHeight: 0.9, letterSpacing: "-4px", color: "var(--text)", marginBottom: "28px" }}>
          {mm > 0 ? `${mm}:${ss}` : `0:${ss}`}
        </div>

        {/* Debater cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "stretch", width: "100%", maxWidth: "600px" }}>
          <DebaterCard name={MOCK_ROOM.sideA.name} stance={MOCK_ROOM.sideA.stance} avatar={MOCK_ROOM.sideA.avatar} avatarColor={MOCK_ROOM.sideA.color} active={MOCK_ROOM.activeSide === "A"} side="A" />
          <div style={{ display: "flex", alignItems: "center", padding: "0 20px", fontFamily: "var(--font-oswald, 'Oswald', sans-serif)", fontSize: "16px", fontWeight: 700, color: "var(--dim)", letterSpacing: "3px" }}>VS</div>
          <DebaterCard name={MOCK_ROOM.sideB.name} stance={MOCK_ROOM.sideB.stance} avatar={MOCK_ROOM.sideB.avatar} avatarColor={MOCK_ROOM.sideB.color} active={MOCK_ROOM.activeSide === "B"} side="B" />
        </div>

        {/* Vote snapshot */}
        <div style={{ width: "100%", maxWidth: "600px", marginTop: "20px" }}>
          <div style={{ border: "1px solid var(--border)", background: "var(--card)", padding: "16px 20px" }}>
            <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--dim)", marginBottom: "10px" }}>Live Vote Snapshot — Hidden Until Close</div>
            <div style={{ height: "5px", background: "var(--border2)", borderRadius: "3px", overflow: "hidden", marginBottom: "8px" }}>
              <div style={{ height: "100%", width: `${voteARounded}%`, background: "linear-gradient(90deg, #3b82f6, #fb923c)", transition: "width 1.5s ease" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "var(--font-oswald, 'Oswald', sans-serif)", fontSize: "13px", fontWeight: 700, color: "#60a5fa" }}>{MOCK_ROOM.sideA.stance} {voteARounded}%</span>
              <span style={{ fontFamily: "var(--font-oswald, 'Oswald', sans-serif)", fontSize: "13px", fontWeight: 700, color: "#fb923c" }}>{MOCK_ROOM.sideB.stance} {voteB}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Audience section */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 40px" }}>
      <div style={{ width: "100%", maxWidth: "600px", marginTop: "32px", paddingBottom: "48px" }}>
        {/* Label */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
          <div className="status-dot-live" style={{ width: "5px", height: "5px", borderRadius: "50%", background: "var(--g)", flexShrink: 0 }} />
          <span style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", letterSpacing: "2.5px", textTransform: "uppercase", color: "var(--dim)" }}>Audience</span>
          <span style={{ fontFamily: "var(--font-oswald, 'Oswald', sans-serif)", fontSize: "13px", fontWeight: 700, color: "var(--dim)", marginLeft: "4px" }}>{MOCK_SPECTATORS.length + 835}</span>
        </div>

        {/* Avatar grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "20px 12px" }}>
          {MOCK_SPECTATORS.map((s) => (
            <div key={s.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
              <div style={{
                width: "48px", height: "48px", borderRadius: "50%", background: s.color,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--font-oswald, 'Oswald', sans-serif)", fontSize: "16px", fontWeight: 700, color: "#fff",
                border: "2px solid var(--border2)",
              }}>{s.avatar}</div>
              <span style={{ fontFamily: "var(--font-body, 'Familjen Grotesk', sans-serif)", fontSize: "10px", color: "var(--dim)", textAlign: "center", lineHeight: 1.2, wordBreak: "break-word" }}>{s.name}</span>
            </div>
          ))}

          {/* +more tile */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
            <div style={{
              width: "48px", height: "48px", borderRadius: "50%", background: "var(--card)",
              border: "1px dashed var(--border2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", color: "var(--dim)",
            }}>+835</div>
            <span style={{ fontFamily: "var(--font-body, 'Familjen Grotesk', sans-serif)", fontSize: "10px", color: "var(--dim)", textAlign: "center" }}>more</span>
          </div>
        </div>
      </div>
      </div>
    </main>
  );
}

function DebaterCard({
  name, stance, avatar, avatarColor, active, side,
}: {
  name: string; stance: string; avatar: string;
  avatarColor: string; active: boolean; side: "A" | "B";
}) {
  return (
    <div style={{
      background: active ? "rgba(0,255,135,0.04)" : "var(--card)",
      border: `1px solid ${active ? "var(--g)" : "var(--border)"}`,
      borderRadius: "4px",
      padding: "32px 24px",
      display: "flex", flexDirection: "column",
      alignItems: "center", gap: "12px",
      transition: "border-color 0.3s",
    }}>
      {/* Avatar */}
      <div style={{
        width: "56px", height: "56px", borderRadius: "50%",
        background: avatarColor,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
        fontSize: "22px", fontWeight: 700, color: "#fff",
      }}>
        {avatar}
      </div>

      {/* Name */}
      <div style={{
        fontFamily: "var(--font-body, 'Familjen Grotesk', sans-serif)",
        fontSize: "15px", fontWeight: 600, color: "var(--text)",
        textAlign: "center",
      }}>
        {name}
      </div>

      {/* Stance */}
      <div style={{
        fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
        fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase",
        color: active ? "var(--g)" : "var(--dim)",
      }}>
        For {stance}
      </div>

      {/* Audio indicator */}
      <div style={{ height: "24px", display: "flex", alignItems: "center" }}>
        {active ? <WaveformBars /> : <InactiveDots />}
      </div>
    </div>
  );
}
