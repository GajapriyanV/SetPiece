"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import SignInModal from "@/components/auth/SignInModal";
import { createClient } from "@/utils/supabase/client";

const QUICK_LINKS = [
  { label: "Watch a live debate", sub: "See how it works in real time", anchor: "debates", href: null, icon: "▶" },
  { label: "View leaderboard", sub: "Top ranked debaters this season", anchor: "leaderboard", href: null, icon: "🏆" },
  { label: "Browse topics", sub: "Find a debate to join or judge", anchor: null, href: "/rooms", icon: "→" },
  { label: "Join the discussion", sub: "Post takes, reply to debates, earn MVPs", anchor: null, href: "/forum", icon: "💬" },
];

export default function CtaStrip() {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [showSignIn, setShowSignIn] = useState(false);
  const [user, setUser] = useState<unknown>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  const handleQuickLink = (anchor: string | null, href: string | null) => {
    if (href) { router.push(href); return; }
    if (anchor) {
      if (pathname === "/") {
        document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth" });
        window.history.pushState(null, "", `/#${anchor}`);
      } else {
        router.push(`/#${anchor}`);
      }
    }
  };

  const handleEnterPitch = () => {
    if (user) {
      router.push("/rooms");
    } else {
      setShowSignIn(true);
    }
  };

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, i) => {
          if (entry.isIntersecting) setTimeout(() => entry.target.classList.add("on"), i * 80);
        });
      },
      { threshold: 0.1 }
    );
    ref.current?.querySelectorAll(".rv").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <>
    {showSignIn && (
      <SignInModal
        onClose={() => setShowSignIn(false)}
      />
    )}
    <section style={{
      padding: "100px 44px",
      background: "var(--dark)",
      borderTop: "1px solid var(--border)",
    }}>
      <div ref={ref} style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <div
          className="rv"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            overflow: "hidden",
          }}
        >
          {/* Left panel — headline + CTA */}
          <div style={{
            background: "var(--card)",
            padding: "56px 48px",
            position: "relative",
            overflow: "hidden",
            borderRight: "1px solid var(--border)",
          }}>
            {/* Watermark */}
            <div style={{
              position: "absolute",
              fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)",
              fontSize: "160px",
              fontWeight: 900,
              textTransform: "uppercase",
              color: "transparent",
              WebkitTextStroke: "1px rgba(0,255,135,0.04)",
              right: "-16px",
              bottom: "-24px",
              lineHeight: 1,
              pointerEvents: "none",
              userSelect: "none",
              letterSpacing: "-4px",
            }}>
              SP
            </div>

            {/* Eyebrow */}
            <div style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "10px",
              color: "var(--dim)",
              letterSpacing: "3px",
              textTransform: "uppercase",
              marginBottom: "20px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}>
              <div style={{ width: "16px", height: "1px", background: "var(--dim)", flexShrink: 0 }} />
              Ready to step up?
            </div>

            {/* Headline */}
            <h2 style={{
              fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)",
              fontSize: "clamp(52px, 6vw, 88px)",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "-2px",
              lineHeight: 0.9,
              marginBottom: "40px",
            }}>
              <span style={{ display: "block", color: "var(--text)" }}>Got A</span>
              <span style={{ display: "block", color: "var(--text)" }}>Hot Take?</span>
              <span style={{ display: "block", color: "var(--g)" }}>Defend It.</span>
            </h2>

            {/* CTA button */}
            <button
              onClick={handleEnterPitch}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                border: "1px solid var(--g)",
                color: "var(--g)",
                padding: "16px 32px",
                borderRadius: "2px",
                fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)",
                fontSize: "18px",
                fontWeight: 800,
                letterSpacing: "2px",
                textTransform: "uppercase",
                background: "transparent",
                cursor: "pointer",
                transition: "all 0.2s",
                position: "relative",
                zIndex: 1,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(0,255,135,0.08)";
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              Enter The Pitch →
            </button>
          </div>

          {/* Right panel — quick links */}
          <div style={{
            background: "var(--dark2)",
            padding: "56px 48px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}>
            <div style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "10px",
              color: "var(--dim)",
              letterSpacing: "3px",
              textTransform: "uppercase",
              marginBottom: "32px",
            }}>
              Or jump straight in
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
              {QUICK_LINKS.map((link, i) => (
                <button
                  key={i}
                  onClick={() => handleQuickLink(link.anchor, link.href)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "20px 0",
                    textDecoration: "none",
                    transition: "all 0.2s",
                    gap: "16px",
                    background: "transparent",
                    border: "none",
                    borderBottom: "1px solid var(--border)",
                    borderTop: i === 0 ? "1px solid var(--border)" : "none",
                    cursor: "pointer",
                    width: "100%",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.paddingLeft = "8px";
                    (e.currentTarget.querySelector(".ql-arrow") as HTMLElement | null)!.style.color = "var(--g)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.paddingLeft = "0";
                    (e.currentTarget.querySelector(".ql-arrow") as HTMLElement | null)!.style.color = "var(--dim)";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    <div style={{
                      width: "32px",
                      height: "32px",
                      border: "1px solid var(--border2)",
                      borderRadius: "4px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                      fontSize: "12px",
                      color: "var(--g)",
                      flexShrink: 0,
                    }}>
                      {link.icon}
                    </div>
                    <div>
                      <div style={{
                        fontFamily: "var(--font-body, 'Familjen Grotesk', sans-serif)",
                        fontSize: "15px",
                        fontWeight: 600,
                        color: "var(--text)",
                        marginBottom: "2px",
                      }}>
                        {link.label}
                      </div>
                      <div style={{
                        fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                        fontSize: "10px",
                        color: "var(--dim)",
                        letterSpacing: "0.5px",
                      }}>
                        {link.sub}
                      </div>
                    </div>
                  </div>
                  <div className="ql-arrow" style={{
                    fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                    fontSize: "14px",
                    color: "var(--dim)",
                    transition: "color 0.2s",
                    flexShrink: 0,
                  }}>
                    →
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
    </>
  );
}
