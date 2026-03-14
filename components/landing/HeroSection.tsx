"use client";

import { useEffect, useRef, useState } from "react";
import SignInModal from "@/components/auth/SignInModal";

const BASE_TICKER = [
  { icon: "⚽", topic: "Messi vs Ronaldo", category: "GOAT Debate" },
  { icon: "🔥", topic: "Haaland vs Mbappé", category: "Future GOAT" },
  { icon: "⚡", topic: "Best PL Season Ever", category: "City 23/24 vs Arsenal 03/04" },
  { icon: "🏆", topic: "Greatest Club", category: "Real Madrid vs Barça" },
  { icon: "🎯", topic: "Best Free Kick Taker", category: "All Time" },
  { icon: "💥", topic: "Bellingham vs Pedri", category: "Gen Z Midfield" },
];
const TICKER_ITEMS = [...BASE_TICKER, ...BASE_TICKER];

export default function HeroSection() {
  const counterRef = useRef<HTMLSpanElement>(null);
  const [showSignIn, setShowSignIn] = useState(false);

  useEffect(() => {
    let count = 847;
    const id = setInterval(() => {
      count += Math.floor(Math.random() * 2);
      if (counterRef.current) counterRef.current.textContent = count.toLocaleString();
    }, 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
    {showSignIn && (
      <SignInModal
        onClose={() => setShowSignIn(false)}
      />
    )}
    <section
      style={{
        minHeight: "100vh",
        paddingTop: "60px",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Scanlines */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,255,135,0.008) 3px, rgba(0,255,135,0.008) 4px)",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />

      {/* Background large number */}
      <div
        style={{
          position: "absolute",
          right: "-40px",
          top: "50%",
          transform: "translateY(-50%)",
          fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
          fontSize: "clamp(280px, 35vw, 520px)",
          fontWeight: 700,
          color: "transparent",
          WebkitTextStroke: "1px rgba(0,255,135,0.04)",
          lineHeight: 1,
          pointerEvents: "none",
          userSelect: "none",
          letterSpacing: "-10px",
          zIndex: 0,
        }}
      >
        01
      </div>

      {/* Main content */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 40px",
          position: "relative",
          zIndex: 2,
          maxWidth: "1400px",
          margin: "0 auto",
          width: "100%",
        }}
      >
        {/* Meta pills */}
        <div
          className="hero-meta"
          style={{ display: "flex", alignItems: "center", gap: "24px", marginBottom: "48px" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              border: "1px solid rgba(0,255,135,0.2)",
              borderRadius: "3px",
              padding: "6px 14px",
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "11px",
              letterSpacing: "1px",
              color: "var(--g)",
            }}
          >
            <div className="live-dot" style={{ width: "5px", height: "5px", background: "var(--g)", borderRadius: "50%" }} />
            847 debating now
          </div>
          <div style={{ width: "1px", height: "16px", background: "var(--border2)" }} />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              border: "1px solid var(--border2)",
              borderRadius: "3px",
              padding: "6px 14px",
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "11px",
              letterSpacing: "1px",
              color: "var(--dim)",
            }}
          >
            Season 01 · Live
          </div>
          <div style={{ width: "1px", height: "16px", background: "var(--border2)" }} />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              border: "1px solid var(--border2)",
              borderRadius: "3px",
              padding: "6px 14px",
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "11px",
              letterSpacing: "1px",
              color: "var(--dim)",
            }}
          >
            94,231 votes cast
          </div>
        </div>

        {/* Headline */}
        <h1
          style={{
            fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
            fontWeight: 700,
            fontSize: "clamp(72px, 10vw, 148px)",
            lineHeight: 0.9,
            textTransform: "uppercase",
            letterSpacing: "-2px",
            marginBottom: "40px",
          }}
        >
          <span className="hero-line-1">Where Football</span>
          <span className="hero-line-2">Arguments</span>
          <span className="hero-line-3">Get Settled.</span>
        </h1>
      </div>

      {/* Bottom stats strip — 5 cells */}
      <div
        className="hero-bottom-anim"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1.4fr 1fr 1fr 1.2fr",
          gap: "1px",
          background: "var(--border)",
          border: "1px solid var(--border)",
        }}
      >
        {/* Cell 1 — Season */}
        <div style={{ background: "var(--dark2)", padding: "20px 24px" }}>
          <div style={{
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase",
            color: "var(--dim)", marginBottom: "8px",
          }}>Season</div>
          <div style={{
            fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
            fontSize: "36px", fontWeight: 700, lineHeight: 1,
            color: "var(--text)", letterSpacing: "-1px",
          }}>01</div>
          <div style={{ fontSize: "12px", color: "var(--dim)", marginTop: "4px", fontFamily: "var(--font-mono)" }}>
            2026 · Live
          </div>
        </div>

        {/* Cell 2 — Top rated */}
        <div style={{ background: "var(--dark2)", padding: "20px 24px", borderLeft: "1px solid var(--border)" }}>
          <div style={{
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase",
            color: "var(--dim)", marginBottom: "8px",
          }}>Top Rated</div>
          <div style={{
            fontFamily: "var(--font-body, 'Familjen Grotesk', sans-serif)",
            fontSize: "20px", fontWeight: 700, lineHeight: 1,
            color: "var(--text)",
          }}>TacticalGenius_</div>
          <div style={{ fontSize: "12px", color: "var(--dim)", marginTop: "4px", fontFamily: "var(--font-mono)" }}>
            Rating 2,341
          </div>
        </div>

        {/* Cell 3 — Debates today */}
        <div style={{ background: "var(--dark2)", padding: "20px 24px", borderLeft: "1px solid var(--border)" }}>
          <div style={{
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase",
            color: "var(--dim)", marginBottom: "8px",
          }}>Debates Today</div>
          <div style={{
            fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
            fontSize: "36px", fontWeight: 700, lineHeight: 1,
            color: "var(--g)", letterSpacing: "-1px",
          }}>
            <span ref={counterRef}>133</span>
          </div>
          <div style={{ fontSize: "12px", color: "var(--dim)", marginTop: "4px", fontFamily: "var(--font-mono)" }}>
            ↑ 18% vs yesterday
          </div>
        </div>

        {/* Cell 4 — Votes cast */}
        <div style={{ background: "var(--dark2)", padding: "20px 24px", borderLeft: "1px solid var(--border)" }}>
          <div style={{
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase",
            color: "var(--dim)", marginBottom: "8px",
          }}>Votes Cast</div>
          <div style={{
            fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
            fontSize: "36px", fontWeight: 700, lineHeight: 1,
            color: "var(--text)", letterSpacing: "-1px",
          }}>94.2K</div>
          <div style={{ fontSize: "12px", color: "var(--dim)", marginTop: "4px", fontFamily: "var(--font-mono)" }}>
            All time
          </div>
        </div>

        {/* Cell 5 — CTA */}
        <div style={{
          background: "var(--dark2)", padding: "20px 24px",
          borderLeft: "1px solid var(--border)",
          display: "flex", flexDirection: "column", justifyContent: "space-between",
        }}>
          <div style={{
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase",
            color: "var(--g)", marginBottom: "12px",
          }}>Ready To Debate?</div>
          <button
            onClick={() => setShowSignIn(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: "8px",
              background: "var(--g)", color: "#000",
              padding: "10px 20px", borderRadius: "3px",
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "12px", fontWeight: 700,
              letterSpacing: "1px", textTransform: "uppercase",
              border: "none", cursor: "pointer", transition: "all 0.2s",
              width: "fit-content",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--g2)";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--g)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            Enter pitch →
          </button>
        </div>
      </div>

      {/* Debate ticker — visible in viewport */}
      <div
        style={{
          borderTop: "1px solid var(--border)",
          overflow: "hidden",
          padding: "12px 0",
          background: "var(--dark2)",
          position: "relative",
          zIndex: 2,
        }}
      >
        <div className="ticker-track" style={{ display: "flex", whiteSpace: "nowrap" }}>
          {TICKER_ITEMS.map((item, i) => (
            <span
              key={i}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                padding: "0 32px",
                fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                fontSize: "11px",
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                color: "var(--dim)",
              }}
            >
              <b style={{ color: "var(--g)", fontWeight: 400 }}>{item.icon}</b>
              {item.topic}
              <span style={{ color: "var(--border2)" }}>—</span>
              {item.category}
            </span>
          ))}
        </div>
      </div>
    </section>
    </>
  );
}
