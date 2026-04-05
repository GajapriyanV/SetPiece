"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

interface ReportAuthor {
  username: string;
  avatar_url: string | null;
}

interface Report {
  id: string;
  target_type: "thread" | "reply";
  target_id: string;
  thread_id: string | null;
  reason: string;
  custom_reason: string | null;
  is_reviewed: boolean;
  created_at: string;
  reporter: ReportAuthor;
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

export default function AdminReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"unreviewed" | "all">("unreviewed");
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/"); return; }
      const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
      if (!profile?.is_admin) { setAccessDenied(true); setLoading(false); return; }
      fetchReports();
    };
    checkAdmin();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!accessDenied && !loading) fetchReports();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const fetchReports = async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/reports?filter=${filter}`);
    if (!res.ok) { setAccessDenied(true); setLoading(false); return; }
    const data = await res.json();
    setReports(data.reports ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  };

  const markReviewed = async (reportId: string) => {
    await fetch(`/api/admin/reports/${reportId}`, { method: "PATCH" });
    setReports((prev) => prev.map((r) => r.id === reportId ? { ...r, is_reviewed: true } : r));
    if (filter === "unreviewed") {
      setReports((prev) => prev.filter((r) => r.id !== reportId));
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
          <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: "var(--dim)", marginBottom: "10px" }}>Admin</div>
          <div style={{ fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)", fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 900, textTransform: "uppercase", letterSpacing: "-2px", color: "var(--text)" }}>
            Reports
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
            {total} report{total !== 1 ? "s" : ""}
          </div>
        </div>

        {loading ? (
          <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "11px", color: "var(--dim)", letterSpacing: "2px", textTransform: "uppercase", padding: "40px 0", textAlign: "center" }}>Loading…</div>
        ) : reports.length === 0 ? (
          <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "11px", color: "var(--dim)", letterSpacing: "2px", textTransform: "uppercase", padding: "60px 0", textAlign: "center", border: "1px solid var(--border)" }}>
            {filter === "unreviewed" ? "No pending reports." : "No reports."}
          </div>
        ) : (
          <div style={{ border: "1px solid var(--border)" }}>
            {reports.map((report) => (
              <div
                key={report.id}
                style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", background: report.is_reviewed ? "var(--dark)" : "var(--card)", display: "grid", gridTemplateColumns: "1fr auto", gap: "20px", alignItems: "start" }}
              >
                <div>
                  {/* Target + reason */}
                  <div style={{ display: "flex", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "8px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--dim)", border: "1px solid var(--border)", padding: "2px 8px" }}>
                      {report.target_type}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "8px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--red)", border: "1px solid rgba(255,45,85,0.3)", padding: "2px 8px" }}>
                      {report.reason}
                    </span>
                    {report.is_reviewed && (
                      <span style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "8px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--g)", border: "1px solid rgba(0,255,135,0.3)", padding: "2px 8px" }}>
                        Reviewed
                      </span>
                    )}
                  </div>

                  {/* Custom reason */}
                  {report.custom_reason && (
                    <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "12px", color: "var(--text)", marginBottom: "10px", padding: "8px 12px", background: "var(--dark3)", border: "1px solid var(--border)" }}>
                      &ldquo;{report.custom_reason}&rdquo;
                    </div>
                  )}

                  {/* View target */}
                  <div style={{ marginBottom: "8px" }}>
                    {report.target_type === "thread" ? (
                      <Link href={`/forum/${report.target_id}`} target="_blank" style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "10px", color: "var(--g)", letterSpacing: "1.5px", textDecoration: "none", borderBottom: "1px solid rgba(0,255,135,0.3)" }}>
                        View thread →
                      </Link>
                    ) : report.thread_id ? (
                      <Link href={`/forum/${report.thread_id}#reply-${report.target_id}`} target="_blank" style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "10px", color: "var(--g)", letterSpacing: "1.5px", textDecoration: "none", borderBottom: "1px solid rgba(0,255,135,0.3)" }}>
                        View reply →
                      </Link>
                    ) : (
                      <span style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "10px", color: "var(--dim)", letterSpacing: "1px" }}>
                        Reply deleted
                      </span>
                    )}
                  </div>

                  {/* Reporter + time */}
                  <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", color: "var(--dim)", letterSpacing: "1.5px", display: "flex", gap: "8px" }}>
                    <span>Reported by @{report.reporter?.username ?? "unknown"}</span>
                    <span>·</span>
                    <span>{timeAgo(report.created_at)}</span>
                  </div>
                </div>

                {/* Actions */}
                {!report.is_reviewed && (
                  <button
                    onClick={() => markReviewed(report.id)}
                    style={{ padding: "8px 16px", border: "1px solid rgba(0,255,135,0.4)", background: "rgba(0,255,135,0.08)", color: "var(--g)", fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer", transition: "all 0.15s", flexShrink: 0 }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,255,135,0.15)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(0,255,135,0.08)"; }}
                  >
                    Mark Reviewed
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
