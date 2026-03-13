"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function TopNav() {
  const pathname = usePathname();

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
        {[
          { label: "Debates",  href: "/#debates" },
          { label: "Format",   href: "/#how"     },
          { label: "Rankings", href: "/rankings" },
        ].map(({ label, href }) => {
          const isActive = href.startsWith("/") && !href.startsWith("/#") && pathname === href;
          return (
            <Link
              key={label}
              href={href}
              style={{
                fontSize: "12px",
                color: isActive ? "var(--g)" : "var(--dim)",
                textDecoration: "none",
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                transition: "color 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = isActive ? "var(--g)" : "var(--dim)")}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {/* Right side */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <Link
          href="/login"
          style={{
            fontSize: "12px",
            color: "var(--text)",
            textDecoration: "none",
            letterSpacing: "1.5px",
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            textTransform: "uppercase",
            fontWeight: 400,
            padding: "8px 20px",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "3px",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--dim)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
          }}
        >
          Sign In
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
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--g)";
          }}
        >
          Get Started →
        </Link>
      </div>
    </nav>
  );
}
