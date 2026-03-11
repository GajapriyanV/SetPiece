"use client";

import { useEffect, useRef } from "react";

const STEPS = [
  {
    num: "01",
    icon: "🎯",
    name: "Pick Your Side",
    desc: "Choose a debate topic and pick your position. Join as a speaker to argue or as a listener to watch.",
  },
  {
    num: "02",
    icon: "🎙️",
    name: "Argue Live",
    desc: "Timed voice rounds. Opening statement, rebuttal, closing argument. Server-enforced. No chaos.",
  },
  {
    num: "03",
    icon: "🗳️",
    name: "Crowd Votes",
    desc: "Audience votes after closing arguments. Hidden tallies prevent bandwagon bias. One vote per person.",
  },
  {
    num: "04",
    icon: "📈",
    name: "Earn Your Rank",
    desc: "Elo-based rating system. Win debates and climb. Lose and drop. Your record is public and permanent.",
  },
];

export default function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, i) => {
          if (entry.isIntersecting) {
            setTimeout(() => entry.target.classList.add("on"), i * 80);
          }
        });
      },
      { threshold: 0.1 }
    );
    ref.current?.querySelectorAll(".rv").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <div
      id="how"
      style={{
        background: "var(--dark2)",
        borderTop: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
        padding: "100px 40px",
      }}
    >
      <div ref={ref} style={{ maxWidth: "1400px", margin: "0 auto" }}>
        <div className="rv">
          <div className="sec-label">The Format</div>
          <h2
            style={{
              fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
              fontSize: "clamp(36px, 4vw, 56px)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "-1px",
              lineHeight: 1,
            }}
          >
            How It Works
          </h2>
        </div>

        <div
          className="rv"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            marginTop: "60px",
            border: "1px solid var(--border)",
          }}
        >
          {STEPS.map((step, i) => (
            <div
              key={step.num}
              style={{
                padding: "40px 32px",
                borderRight: i < STEPS.length - 1 ? "1px solid var(--border)" : "none",
                transition: "background 0.3s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = "rgba(0,255,135,0.02)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = "transparent";
              }}
            >
              <div className="p-num">{step.num}</div>
              <div style={{ fontSize: "32px", marginBottom: "20px" }}>{step.icon}</div>
              <div
                style={{
                  fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
                  fontSize: "20px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  marginBottom: "10px",
                }}
              >
                {step.name}
              </div>
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--dim)",
                  lineHeight: 1.7,
                }}
              >
                {step.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
