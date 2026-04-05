"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

interface Ticket {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  is_reviewed: boolean;
  created_at: string;
  user_id: string | null;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function AdminContactPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"unreviewed" | "all">("unreviewed");
  const [accessDenied, setAccessDenied] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const checkAdmin = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/"); return; }
      const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
      if (!profile?.is_admin) { setAccessDenied(true); setLoading(false); return; }
      fetchTickets();
    };
    checkAdmin();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!accessDenied && !loading) fetchTickets();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const fetchTickets = async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/contact?filter=${filter}`);
    if (!res.ok) { setAccessDenied(true); setLoading(false); return; }
    const data = await res.json();
    setTickets(data.tickets ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  };

  const markReviewed = async (ticketId: string) => {
    await fetch(`/api/admin/contact/${ticketId}`, { method: "PATCH" });
    setTickets((prev) => prev.map((t) => t.id === ticketId ? { ...t, is_reviewed: true } : t));
    if (filter === "unreviewed") {
      setTickets((prev) => prev.filter((t) => t.id !== ticketId));
      if (expanded === ticketId) setExpanded(null);
    }
  };

  if (accessDenied) {
    return (
      <div style={{ paddingTop: "60px", minHeight: "100vh", background: "var(--dark)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px" }}>
        <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "11px", color: "var(--red)", letterSpacing: "2px", textTransform: "uppercase" }}>Access denied.</div>
        <Link href="/" style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "10px", color: "var(--dim)", letterSpacing: "2px", textTransform: "uppercase", textDecoration: "none", borderBottom: "1px solid var(--border2)" }}>← Home</Link>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: "60px", minHeight: "100vh", background: "var(--dark)" }}>

      {/* Header */}
      <div style={{ borderBottom: "1px solid var(--border)" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "40px 40px 28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "10px" }}>
            <Link href="/admin/reports" style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--dim)", textDecoration: "none", transition: "color 0.15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--dim)")}
            >Reports</Link>
            <span style={{ color: "var(--border2)" }}>·</span>
            <span style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--g)" }}>Support</span>
          </div>
          <div style={{ fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)", fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 900, textTransform: "uppercase", letterSpacing: "-2px", color: "var(--text)" }}>
            Support Tickets
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "28px 40px 80px" }}>

        {/* Filter + count */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "6px" }}>
            {(["unreviewed", "all"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{ padding: "6px 16px", border: `1px solid ${filter === f ? "var(--text)" : "var(--border)"}`, background: filter === f ? "var(--dark3)" : "transparent", color: filter === f ? "var(--text)" : "var(--dim)", fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer", transition: "all 0.15s" }}
              >
                {f}
              </button>
            ))}
          </div>
          <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "10px", color: "var(--dim)", letterSpacing: "1.5px" }}>
            {total} ticket{total !== 1 ? "s" : ""}
          </div>
        </div>

        {loading ? (
          <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "11px", color: "var(--dim)", letterSpacing: "2px", textTransform: "uppercase", padding: "40px 0", textAlign: "center" }}>Loading…</div>
        ) : tickets.length === 0 ? (
          <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "11px", color: "var(--dim)", letterSpacing: "2px", textTransform: "uppercase", padding: "60px 0", textAlign: "center", border: "1px solid var(--border)" }}>
            {filter === "unreviewed" ? "No pending tickets." : "No tickets."}
          </div>
        ) : (
          <div style={{ border: "1px solid var(--border)" }}>
            {tickets.map((ticket) => {
              const isOpen = expanded === ticket.id;
              return (
                <div key={ticket.id} style={{ borderBottom: "1px solid var(--border)", background: ticket.is_reviewed ? "var(--dark)" : "var(--card)" }}>
                  {/* Row — click to expand */}
                  <button
                    onClick={() => setExpanded(isOpen ? null : ticket.id)}
                    style={{
                      width: "100%", background: "transparent", border: "none", cursor: "pointer",
                      padding: "18px 24px", textAlign: "left",
                      display: "grid", gridTemplateColumns: "1fr auto", gap: "16px", alignItems: "center",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: "5px", minWidth: 0 }}>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                        {ticket.is_reviewed && (
                          <span style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "7px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--g)", border: "1px solid rgba(0,255,135,0.3)", padding: "2px 6px" }}>Reviewed</span>
                        )}
                        <span style={{ fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)", fontSize: "16px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {ticket.subject}
                        </span>
                      </div>
                      <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", color: "var(--dim)", letterSpacing: "1px", display: "flex", gap: "8px" }}>
                        <span>{ticket.name}</span>
                        <span>·</span>
                        <span>{ticket.email}</span>
                        <span>·</span>
                        <span>{timeAgo(ticket.created_at)}</span>
                      </div>
                    </div>
                    <span style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "10px", color: "var(--dim)", transition: "transform 0.2s", display: "inline-block", transform: isOpen ? "rotate(180deg)" : "none" }}>▾</span>
                  </button>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div style={{ padding: "0 24px 24px", borderTop: "1px solid var(--border)" }}>
                      <div style={{
                        fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                        fontSize: "12px", color: "var(--text)", lineHeight: 1.8,
                        padding: "20px", background: "var(--dark3)", border: "1px solid var(--border)",
                        margin: "16px 0",
                        whiteSpace: "pre-wrap",
                      }}>
                        {ticket.message}
                      </div>

                      <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", color: "var(--dim)", letterSpacing: "1px" }}>
                          From: <span style={{ color: "var(--text)" }}>{ticket.name}</span> · <span style={{ color: "var(--text)" }}>{ticket.email}</span>
                          {ticket.user_id && <span style={{ color: "var(--dim)" }}> · registered user</span>}
                        </div>
                        {!ticket.is_reviewed && (
                          <button
                            onClick={() => markReviewed(ticket.id)}
                            style={{ padding: "8px 16px", border: "1px solid rgba(0,255,135,0.4)", background: "rgba(0,255,135,0.08)", color: "var(--g)", fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer", transition: "all 0.15s" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,255,135,0.15)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(0,255,135,0.08)")}
                          >
                            Mark Reviewed
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
