"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import SignInModal from "@/components/auth/SignInModal";
import { createClient } from "@/utils/supabase/client";
import type { User } from "@supabase/supabase-js";

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [showSignIn, setShowSignIn] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
    };
    fetchUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: string, session: { user: User | null } | null) => {
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    router.refresh();
  };

  return (
    <>
    {showSignIn && (
      <SignInModal
        onClose={() => setShowSignIn(false)}
      />
    )}
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
      <Link
        href="/"
        onClick={(e) => {
          if (pathname === "/") {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
        }}
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
          textDecoration: "none",
          cursor: "pointer",
        }}
      >
        SET<span style={{ color: "var(--g)", fontWeight: 300 }}>/</span>PIECE
      </Link>

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
          { label: "Format",   href: "/#format"  },
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
        {user ? (
          <>
            <span style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "11px", color: "var(--text)", letterSpacing: "1.5px",
              textTransform: "uppercase",
            }}>
              {user.user_metadata?.username || user.email?.split("@")[0] || "User"}
            </span>
            <button
              onClick={handleSignOut}
              style={{
                fontSize: "12px",
                color: "var(--dim)",
                background: "transparent",
                letterSpacing: "1.5px",
                fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                textTransform: "uppercase",
                fontWeight: 400,
                padding: "8px 20px",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "3px",
                transition: "all 0.2s",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--dim)";
                e.currentTarget.style.color = "var(--text)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
                e.currentTarget.style.color = "var(--dim)";
              }}
            >
              Sign Out
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setShowSignIn(true)}
              style={{
                fontSize: "12px",
                color: "var(--text)",
                background: "transparent",
                letterSpacing: "1.5px",
                fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                textTransform: "uppercase",
                fontWeight: 400,
                padding: "8px 20px",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "3px",
                transition: "all 0.2s",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--dim)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
              }}
            >
              Sign In
            </button>
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
                fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                textDecoration: "none",
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
          </>
        )}
      </div>
    </nav>
    </>
  );
}
