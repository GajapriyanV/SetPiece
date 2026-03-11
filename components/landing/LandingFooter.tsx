"use client";

import Link from "next/link";

const LINKS = ["About", "Format", "Rankings", "Twitter/X", "Discord"];

export default function LandingFooter() {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--border)",
        padding: "28px 40px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "var(--dark2)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
          fontSize: "16px",
          letterSpacing: "4px",
          fontWeight: 500,
          textTransform: "uppercase",
        }}
      >
        SET<span style={{ color: "var(--g)" }}>/</span>PIECE
      </div>

      <div style={{ display: "flex", gap: "24px" }}>
        {LINKS.map((label) => (
          <Link
            key={label}
            href="#"
            style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "10px",
              color: "var(--dim)",
              textDecoration: "none",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              transition: "color 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--dim)")}
          >
            {label}
          </Link>
        ))}
      </div>

      <div
        style={{
          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
          fontSize: "10px",
          color: "var(--dim)",
          letterSpacing: "1px",
        }}
      >
        © 2026 SetPiece
      </div>
    </footer>
  );
}
