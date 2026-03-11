"use client";

import { useEffect, useRef } from "react";

const FEATURES = [
  {
    icon: "🎙️",
    name: "Live Voice Rooms",
    desc: "Crystal clear WebRTC audio. Two speakers, unlimited listeners. Powered by LiveKit — the same tech Discord is built on.",
    tag: "LiveKit WebRTC",
  },
  {
    icon: "⏱️",
    name: "Structured Rounds",
    desc: "Opening, rebuttal, closing. Server-authoritative timer broadcasts to every user simultaneously. No drift. No chaos.",
    tag: "Socket.IO",
  },
  {
    icon: "🗳️",
    name: "Bias-Proof Voting",
    desc: "Hidden tallies until close. Mind-change metric rewards whoever shifts opinions, not whoever has more followers.",
    tag: "Real-time",
  },
  {
    icon: "📊",
    name: "Elo Rankings",
    desc: "Chess-style rating. Win against higher-rated debaters and earn more. Lose to lower-rated ones and drop harder.",
    tag: "Global",
  },
  {
    icon: "🏆",
    name: "Weekly Leaderboards",
    desc: "Top debaters this week. All-time records. Most wins. Updated after every debate. Become the voice of your club's fanbase.",
    tag: "Updated Live",
  },
  {
    icon: "💬",
    name: "Live Audience Chat",
    desc: "React in real time as arguments land. Fire emojis, live reactions, chat that moves as fast as the debate.",
    tag: "Real-time",
  },
];

export default function FeaturesGrid() {
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
    <section style={{ padding: "100px 40px" }}>
      <div ref={ref} style={{ maxWidth: "1400px", margin: "0 auto" }}>
        <div className="rv">
          <div className="sec-label">Platform</div>
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
            Built For The Real Fan
          </h2>
        </div>

        <div
          className="rv"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "1px",
            background: "var(--border)",
            border: "1px solid var(--border)",
            marginTop: "60px",
          }}
        >
          {FEATURES.map((f) => (
            <div
              key={f.name}
              className="feature-card"
              style={{
                background: "var(--card)",
                padding: "36px 32px",
                transition: "background 0.3s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = "#13131a";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = "var(--card)";
              }}
            >
              <div style={{ fontSize: "28px", marginBottom: "20px" }}>{f.icon}</div>
              <div
                style={{
                  fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
                  fontSize: "19px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  marginBottom: "10px",
                }}
              >
                {f.name}
              </div>
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--dim)",
                  lineHeight: 1.8,
                }}
              >
                {f.desc}
              </div>
              <span
                style={{
                  display: "inline-block",
                  marginTop: "16px",
                  fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                  fontSize: "10px",
                  color: "var(--g)",
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  border: "1px solid rgba(0,255,135,0.2)",
                  padding: "3px 10px",
                  borderRadius: "2px",
                }}
              >
                {f.tag}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
