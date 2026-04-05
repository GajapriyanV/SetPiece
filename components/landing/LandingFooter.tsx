"use client";

import Link from "next/link";
import Image from "next/image";

const NAV_LINKS = [
  { label: "Contact Us", href: null },
];

const SOCIAL_LINKS = [
  { label: "Twitter/X", href: "https://x.com/setpieceapp" },
  { label: "Instagram", href: "https://instagram.com/setpieceapp" },
  { label: "TikTok",    href: "https://tiktok.com/@setpieceapp" },
];

export default function LandingFooter() {
  return (
    <footer className="r-footer">
      <div style={{ display: "flex", alignItems: "center" }}>
        <Image src="/logo.png" alt="SetPiece" width={200} height={60} style={{ display: "block", height: "28px", width: "auto" }} />
      </div>

      <div style={{ display: "flex", gap: "24px" }}>
        {NAV_LINKS.map(({ label, href }) => (
          <span
            key={label}
            style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "10px",
              color: "var(--dim)",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              transition: "color 0.2s",
              cursor: "default",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--dim)")}
          >
            {label}
          </span>
        ))}
        <div style={{ width: "1px", background: "var(--border2)", alignSelf: "stretch" }} />
        {SOCIAL_LINKS.map(({ label, href }) => (
          <Link
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
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
