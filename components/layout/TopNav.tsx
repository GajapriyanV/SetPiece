"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import SignInModal from "@/components/auth/SignInModal";
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";
import type { User } from "@supabase/supabase-js";

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [showSignIn, setShowSignIn] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchProfileUsername = async (userId: string) => {
    const { data } = await supabase.from("profiles").select("username").eq("id", userId).single();
    if (data?.username) setProfileUsername(data.username);
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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
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
      className="r-pad"
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
      <div className="r-nav-links">
        {[
          { label: "Debates",  href: "/#debates",  anchor: "debates"  },
          { label: "Format",   href: "/#format",   anchor: "format"   },
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

      {/* Hamburger (mobile only) */}
      <button
        className="r-nav-hamburger"
        onClick={() => setDrawerOpen((p) => !p)}
        aria-label="Toggle menu"
      >
        <svg width="22" height="16" viewBox="0 0 22 16" fill="none">
          <rect y="0" width="22" height="2" rx="1" fill={drawerOpen ? "var(--g)" : "var(--text)"} />
          <rect y="7" width="22" height="2" rx="1" fill={drawerOpen ? "var(--g)" : "var(--text)"} />
          <rect y="14" width="22" height="2" rx="1" fill={drawerOpen ? "var(--g)" : "var(--text)"} />
        </svg>
      </button>

      {/* Right side */}
      <div className="r-nav-right">
        {user ? (
          <>
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

    {/* Mobile drawer */}
    <div className={`r-nav-drawer${drawerOpen ? " open" : ""}`}>
      {[
        { label: "Debates", href: "/rooms" },
        { label: "Format", href: "/#format" },
        { label: "Rankings", href: "/rankings" },
      ].map(({ label, href }) => (
        <Link key={label} href={href} onClick={() => setDrawerOpen(false)}>
          {label}
        </Link>
      ))}
      <div style={{ height: "1px", background: "var(--border)", margin: "8px 0" }} />
      {user ? (
        <>
          <Link href="/profile" onClick={() => setDrawerOpen(false)}>
            {profileUsername || "Profile"}
          </Link>
          <button onClick={() => { handleSignOut(); setDrawerOpen(false); }}>
            Sign Out
          </button>
        </>
      ) : (
        <>
          <button onClick={() => { setShowSignIn(true); setDrawerOpen(false); }}>
            Sign In
          </button>
          <Link
            href="/register"
            className="r-drawer-cta"
            onClick={() => setDrawerOpen(false)}
          >
            Get Started →
          </Link>
        </>
      )}
    </div>
    </>
  );
}
