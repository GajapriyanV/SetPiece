"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import SignInModal from "@/components/auth/SignInModal";
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";
import type { User } from "@supabase/supabase-js";
import NotificationBell from "@/components/layout/NotificationBell";

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [showSignIn, setShowSignIn] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const adminMenuRef = useRef<HTMLDivElement>(null);

  const fetchProfileUsername = async (userId: string) => {
    const { data } = await supabase.from("profiles").select("username, is_admin").eq("id", userId).single();
    if (data?.username) setProfileUsername(data.username);
    if (data?.is_admin) setIsAdmin(true);
  };

  useEffect(() => {
    const fetchUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
      if (data.user) fetchProfileUsername(data.user.id);
    };
    fetchUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: string, session: { user: User | null } | null) => {
        setUser(session?.user ?? null);
        if (session?.user) fetchProfileUsername(session.user.id);
        else setProfileUsername(null);
      }
    );

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (adminMenuRef.current && !adminMenuRef.current.contains(e.target as Node)) {
        setShowAdminMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsAdmin(false);
    router.push("/");
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
          display: "flex",
          alignItems: "center",
          textDecoration: "none",
          cursor: "pointer",
        }}
      >
        <Image src="/logo.png" alt="SetPiece" width={200} height={60} style={{ display: "block", height: "34px", width: "auto" }} />
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
          { label: "Debates",  href: "/#debates",  anchor: "debates"  },
          { label: "Format",   href: "/#format",   anchor: "format"   },
          { label: "The Pitch", href: "/forum",     anchor: null       },
          { label: "Rankings", href: "/rankings",  anchor: null       },
        ].map(({ label, href, anchor }) => {
          const isActive = href.startsWith("/") && !href.startsWith("/#") && pathname === href;

          const handleAnchorClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
            if (!anchor) return;
            if (pathname === "/") {
              e.preventDefault();
              document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth" });
              window.history.pushState(null, "", `/#${anchor}`);
            }
          };

          return (
            <Link
              key={label}
              href={href}
              onClick={handleAnchorClick}
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
            {isAdmin && (
              <div ref={adminMenuRef} style={{ position: "relative" }}>
                <button
                  onClick={() => setShowAdminMenu((o) => !o)}
                  style={{
                    fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                    fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase",
                    color: showAdminMenu ? "var(--g)" : "var(--dim)",
                    background: "transparent", border: "1px solid var(--border)",
                    padding: "5px 10px", cursor: "pointer", transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--g)";
                    e.currentTarget.style.borderColor = "rgba(0,255,135,0.3)";
                  }}
                  onMouseLeave={(e) => {
                    if (!showAdminMenu) {
                      e.currentTarget.style.color = "var(--dim)";
                      e.currentTarget.style.borderColor = "var(--border)";
                    }
                  }}
                >
                  Admin ▾
                </button>
                {showAdminMenu && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 10px)", right: 0,
                    background: "var(--dark2)", border: "1px solid var(--border)",
                    minWidth: "160px", zIndex: 600, boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                  }}>
                    {[
                      { label: "Reports", href: "/admin/reports" },
                      { label: "Support Tickets", href: "/admin/contact" },
                    ].map(({ label, href }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setShowAdminMenu(false)}
                        style={{
                          display: "block", padding: "11px 16px",
                          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                          fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase",
                          color: "var(--dim)", textDecoration: "none",
                          borderBottom: "1px solid var(--border)", transition: "all 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = "var(--text)";
                          e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = "var(--dim)";
                          e.currentTarget.style.background = "transparent";
                        }}
                      >
                        {label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
            <NotificationBell />
            <Link
              href="/profile"
              style={{
                fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                fontSize: "11px",
                color: "var(--text)",
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                textDecoration: "none",
                transition: "color 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--g)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text)")}
            >
              {profileUsername || user.user_metadata?.username || user.email?.split("@")[0] || "User"}
            </Link>
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
