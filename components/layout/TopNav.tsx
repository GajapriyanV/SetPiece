"use client";

import Link from "next/link";

export default function TopNav() {
  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 500,
        height: "60px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 40px",
        borderBottom: "1px solid var(--border)",
        background: "rgba(6,6,8,0.85)",
        backdropFilter: "blur(20px)",
      }}
    >
      {/* Logo */}
      <div
        style={{
          fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
          fontSize: "17px",
          letterSpacing: "4px",
          fontWeight: 500,
          textTransform: "uppercase",
          color: "var(--text)",
          display: "flex",
          alignItems: "center",
          gap: "2px",
        }}
      >
        SET<span style={{ color: "var(--g)", fontWeight: 300 }}>/</span>PIECE
      </div>

      {/* Center links */}
      <div
        style={{
          display: "flex",
          gap: "32px",
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
        }}
      >
        {["Debates", "Format", "Rankings"].map((label, i) => (
          <Link
            key={label}
            href={i === 0 ? "#debates" : i === 1 ? "#how" : "#leaderboard"}
            style={{
              fontSize: "12px",
              color: "var(--dim)",
              textDecoration: "none",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              transition: "color 0.2s",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "var(--text)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--dim)")
            }
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Right side */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <Link
          href="/login"
          style={{
            fontSize: "12px",
            color: "var(--dim)",
            textDecoration: "none",
            letterSpacing: "1px",
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            transition: "color 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--dim)")}
        >
          Sign in
        </Link>
        <Link
          href="/register"
          style={{
            background: "var(--g)",
            color: "#000",
            padding: "8px 20px",
            borderRadius: "3px",
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "1.5px",
            textTransform: "uppercase",
            textDecoration: "none",
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            transition: "all 0.2s",
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
          Get started →
        </Link>
      </div>
    </nav>
  );
}
