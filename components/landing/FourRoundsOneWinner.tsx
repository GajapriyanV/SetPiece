"use client";

import { useEffect, useRef, useState } from "react";

const STEPS = [
  {
    num: "01",
    name: "Pick Your Side",
    desc: "Choose your topic, pick your position. Join as a speaker to argue or as a listener to watch and vote.",
  },
  {
    num: "02",
    name: "Argue Live",
    desc: "Timed voice rounds. Opening statement, rebuttal, closing argument. Server-enforced. No rambling. No chaos.",
  },
  {
    num: "03",
    name: "Crowd Votes",
    desc: "Audience votes after closing arguments. Hidden tallies prevent bias. One vote per verified account.",
  },
  {
    num: "04",
    name: "Earn Your Rank",
    desc: "Elo rating system updates after every result. Win and climb. Lose and drop. Your record is permanent.",
  },
];

const PHASES = [
  { label: "Opening Statement", duration: 60 },
  { label: "Rebuttal Round", duration: 45 },
  { label: "Closing Argument", duration: 30 },
  { label: "Audience Voting", duration: 20 },
];
const TOTAL_BARS = 6;

function WaveformBars({ active }: { active: boolean }) {
  const heights = [6, 14, 20, 10, 16];
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "2px", height: "20px", marginTop: "8px" }}>
      {heights.map((h, i) => (
        <div
          key={i}
          style={{
            width: "3px",
            borderRadius: "2px",
            background: "var(--g)",
            height: active ? `${h}px` : "3px",
            opacity: active ? 1 : 0.15,
            animation: active ? `wv 0.4s ease-in-out infinite alternate` : "none",
            animationDelay: active ? `${i * 0.07}s` : "0s",
            transition: "height 0.3s, opacity 0.3s",
          }}
        />
      ))}
    </div>
  );
}

function RoomPreview() {
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [sec, setSec] = useState(PHASES[0].duration);
  const [speakerA, setSpeakerA] = useState(true);
  const [voteW, setVoteW] = useState(57);

  useEffect(() => {
    const id = setInterval(() => {
      setSec((s) => {
        if (s <= 1) {
          setPhaseIdx((p) => {
            const next = (p + 1) % PHASES.length;
            setSpeakerA(next % 2 === 0);
            setTimeout(() => setSec(PHASES[next].duration), 0);
            return next;
          });
          return PHASES[(phaseIdx + 1) % PHASES.length].duration;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phaseIdx]);

  useEffect(() => {
    const id = setInterval(() => {
      setVoteW((w) => Math.max(35, Math.min(65, w + (Math.random() - 0.5) * 3)));
    }, 2200);
    return () => clearInterval(id);
  }, []);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const isWarn = sec <= 8;
  const phase = PHASES[phaseIdx];

  return (
    <div style={{
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: "12px",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        background: "var(--dark2)",
        padding: "14px 20px",
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{
          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
          fontSize: "10px", color: "var(--dim)", letterSpacing: "2px", textTransform: "uppercase",
        }}>Live Debate Room</span>
        <div style={{
          display: "flex", alignItems: "center", gap: "6px",
          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
          fontSize: "9px", color: "var(--g)", letterSpacing: "1.5px", textTransform: "uppercase",
        }}>
          <div className="live-dot" style={{ width: "5px", height: "5px", background: "var(--g)", borderRadius: "50%" }} />
          In Progress
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "24px 20px" }}>

        {/* Phase progress bars */}
        <div style={{
          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
          fontSize: "9px", color: "var(--g)",
          letterSpacing: "2px", textTransform: "uppercase",
          textAlign: "center", marginBottom: "10px",
        }}>
          {phase.label}
        </div>
        <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
          {Array.from({ length: TOTAL_BARS }).map((_, i) => {
            const isDone = i < phaseIdx;
            const isActive = i === phaseIdx;
            return (
              <div key={i} style={{
                flex: 1, height: "4px", borderRadius: "2px",
                background: isDone ? "rgba(0,255,135,0.3)" : "var(--border2)",
                position: "relative", overflow: "hidden",
              }}>
                {isActive && (
                  <div style={{
                    position: "absolute", inset: 0,
                    background: "var(--g)",
                    animation: `phase-fill ${phase.duration}s linear forwards`,
                  }} />
                )}
              </div>
            );
          })}
        </div>

        {/* Timer */}
        <div style={{
          textAlign: "center",
          marginBottom: "24px",
          fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)",
          fontSize: "64px", fontWeight: 900,
          letterSpacing: "-2px", lineHeight: 1,
          color: isWarn ? "var(--g)" : "var(--text)",
          transition: "color 0.5s",
        }}>
          {fmt(sec)}
        </div>

        {/* Speaker grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 32px 1fr",
          gap: "10px",
          alignItems: "center",
          marginBottom: "20px",
        }}>
          {/* Speaker A */}
          <div style={{
            background: speakerA ? "rgba(0,255,135,0.03)" : "var(--dark2)",
            border: `1px solid ${speakerA ? "rgba(0,255,135,0.3)" : "var(--border2)"}`,
            borderRadius: "8px",
            padding: "14px",
            textAlign: "center",
            boxShadow: speakerA ? "0 0 24px rgba(0,255,135,0.06)" : "none",
            transition: "all 0.3s",
          }}>
            <div style={{
              width: "40px", height: "40px", borderRadius: "50%",
              background: "#3b82f6",
              margin: "0 auto 8px",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "15px", fontWeight: 700, color: "#fff",
            }}>F</div>
            <div style={{ fontSize: "11px", fontWeight: 600, marginBottom: "2px" }}>FootballIQ99</div>
            <div style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "8px", color: "var(--dim)", letterSpacing: "1px", textTransform: "uppercase",
            }}>For Haaland</div>
            <WaveformBars active={speakerA} />
          </div>

          {/* VS */}
          <div style={{
            fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)",
            fontSize: "16px", fontWeight: 900, color: "var(--dim)",
            textAlign: "center", textTransform: "uppercase",
          }}>vs</div>

          {/* Speaker B */}
          <div style={{
            background: !speakerA ? "rgba(0,255,135,0.03)" : "var(--dark2)",
            border: `1px solid ${!speakerA ? "rgba(0,255,135,0.3)" : "var(--border2)"}`,
            borderRadius: "8px",
            padding: "14px",
            textAlign: "center",
            boxShadow: !speakerA ? "0 0 24px rgba(0,255,135,0.06)" : "none",
            transition: "all 0.3s",
          }}>
            <div style={{
              width: "40px", height: "40px", borderRadius: "50%",
              background: "#fb923c",
              margin: "0 auto 8px",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "15px", fontWeight: 700, color: "#fff",
            }}>M</div>
            <div style={{ fontSize: "11px", fontWeight: 600, marginBottom: "2px" }}>MessiForever</div>
            <div style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "8px", color: "var(--dim)", letterSpacing: "1px", textTransform: "uppercase",
            }}>For Mbappé</div>
            <WaveformBars active={!speakerA} />
          </div>
        </div>

        {/* Vote preview */}
        <div style={{
          background: "var(--dark2)",
          border: "1px solid var(--border)",
          borderRadius: "6px",
          padding: "14px 16px",
        }}>
          <div style={{
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "9px", color: "var(--dim)", letterSpacing: "2px",
            textTransform: "uppercase", marginBottom: "10px",
          }}>
            Live vote snapshot — hidden until close
          </div>
          <div style={{
            height: "6px", background: "var(--border2)", borderRadius: "3px",
            overflow: "hidden", marginBottom: "6px",
          }}>
            <div style={{
              height: "100%",
              background: "linear-gradient(90deg, #3b82f6, #fb923c)",
              borderRadius: "3px",
              width: `${voteW}%`,
              transition: "width 1s ease",
            }} />
          </div>
          <div style={{
            display: "flex", justifyContent: "space-between",
            fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)",
            fontSize: "16px", fontWeight: 800,
          }}>
            <span style={{ color: "#7ab3ff" }}>Haaland {Math.round(voteW)}%</span>
            <span style={{ color: "#fb923c" }}>Mbappé {Math.round(100 - voteW)}%</span>
          </div>
        </div>

      </div>
    </div>
  );
}

export default function FourRoundsOneWinner() {
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
    <section style={{
      background: "var(--dark2)",
      borderBottom: "1px solid var(--border)",
      padding: "100px 44px",
    }}>
      <div ref={ref} style={{ maxWidth: "1400px", margin: "0 auto" }}>

        {/* Heading */}
        <div className="rv">
          <div className="sec-label">The Format</div>
          <h2 style={{
            fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)",
            fontSize: "clamp(40px, 5vw, 68px)",
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "-1px",
            lineHeight: 0.92,
          }}>
            Four Rounds.<br />
            <span style={{ color: "var(--g)" }}>One Winner.</span>
          </h2>
        </div>

        {/* Two-column layout */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "80px",
          alignItems: "center",
          marginTop: "64px",
        }}>

          {/* Left — steps */}
          <div className="rv" style={{ display: "flex", flexDirection: "column" }}>
            {STEPS.map((step, i) => (
              <StepRow key={step.num} step={step} isFirst={i === 0} />
            ))}
          </div>

          {/* Right — animated room */}
          <div className="rv">
            <RoomPreview />
          </div>

        </div>
      </div>
    </section>
  );
}

function StepRow({ step, isFirst }: { step: typeof STEPS[0]; isFirst: boolean }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        gap: "24px",
        padding: "24px 0",
        borderTop: isFirst ? "1px solid var(--border)" : "none",
        borderBottom: "1px solid var(--border)",
        transition: "all 0.2s",
        cursor: "default",
      }}
    >
      {/* Big number */}
      <div style={{
        fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)",
        fontSize: "48px",
        fontWeight: 900,
        lineHeight: 1,
        color: hovered ? "var(--g)" : "rgba(240,240,248,0.06)",
        minWidth: "48px",
        transition: "color 0.2s",
        userSelect: "none",
      }}>
        {step.num}
      </div>

      {/* Text */}
      <div>
        <div style={{
          fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)",
          fontSize: "22px",
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          marginBottom: "6px",
        }}>
          {step.name}
        </div>
        <div style={{
          fontSize: "13px",
          color: "var(--dim)",
          lineHeight: 1.75,
          fontWeight: 400,
        }}>
          {step.desc}
        </div>
      </div>
    </div>
  );
}
