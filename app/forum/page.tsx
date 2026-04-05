"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { FORUM_CATEGORIES, CATEGORY_COLORS } from "@/lib/forumCategories";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ThreadAuthor {
  username: string;
  name: string;
  avatar_url: string | null;
}

interface Thread {
  id: string;
  title: string;
  flair: string;
  is_featured: boolean;
  is_closed: boolean;
  upvotes_count: number;
  reply_count: number;
  created_at: string;
  closes_at: string;
  author: ThreadAuthor;
}

interface ApiResponse {
  threads: Thread[];
  topThread: Thread | null;
  total: number;
  page: number;
  limit: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const FLAIRS = FORUM_CATEGORIES;

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ── New Thread Modal ────────────────────────────────────────────────────────────

function NewThreadModal({ isAdmin, onClose, onCreated }: { isAdmin: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [flair, setFlair] = useState("General");
  const [isFeatured, setIsFeatured] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!title.trim() || !body.trim()) { setError("Title and body are required."); return; }
    setLoading(true);
    setError("");
    const res = await fetch("/api/forum", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, flair, is_featured: isFeatured }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Failed to create thread."); return; }
    onCreated(data.id);
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "var(--dark2)", border: "1px solid var(--border)", width: "100%", maxWidth: "640px", padding: "32px" }}>
        <div style={{ fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)", fontSize: "28px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "-1px", color: "var(--text)", marginBottom: "24px" }}>
          New Thread
        </div>

        {error && (
          <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "11px", color: "var(--red)", letterSpacing: "1px", marginBottom: "16px" }}>
            {error}
          </div>
        )}

        {/* Title */}
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--dim)", marginBottom: "8px" }}>Title</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="What's the debate?"
            style={{ width: "100%", background: "var(--dark)", border: "1px solid var(--border)", color: "var(--text)", padding: "10px 14px", fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "12px", outline: "none", boxSizing: "border-box" }}
          />
        </div>

        {/* Body */}
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--dim)", marginBottom: "8px" }}>Your Take</div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            rows={5}
            placeholder="Start the debate..."
            style={{ width: "100%", background: "var(--dark)", border: "1px solid var(--border)", color: "var(--text)", padding: "10px 14px", fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "12px", outline: "none", resize: "vertical", boxSizing: "border-box" }}
          />
        </div>

        {/* Category */}
        <div style={{ marginBottom: isAdmin ? "16px" : "24px" }}>
          <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--dim)", marginBottom: "8px" }}>Category</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {FLAIRS.slice(1).map((f) => {
              const col = CATEGORY_COLORS[f] ?? "var(--dim)";
              const active = flair === f;
              return (
                <button
                  key={f}
                  onClick={() => setFlair(f)}
                  style={{ padding: "5px 12px", border: `1px solid ${active ? col : "var(--border)"}`, background: active ? `${col}18` : "transparent", color: active ? col : "var(--dim)", fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer", transition: "all 0.15s" }}
                >
                  {f}
                </button>
              );
            })}
          </div>
        </div>

        {/* Admin: featured toggle */}
        {isAdmin && (
          <div style={{ marginBottom: "24px", display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              onClick={() => setIsFeatured(!isFeatured)}
              style={{ width: "36px", height: "20px", background: isFeatured ? "var(--g)" : "var(--dark3)", border: "1px solid var(--border)", borderRadius: "10px", cursor: "pointer", position: "relative", transition: "background 0.2s" }}
            >
              <span style={{ position: "absolute", top: "2px", left: isFeatured ? "17px" : "2px", width: "14px", height: "14px", background: isFeatured ? "#000" : "var(--dim)", borderRadius: "50%", transition: "left 0.2s" }} />
            </button>
            <span style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--dim)" }}>
              Featured Thread (Admin)
            </span>
          </div>
        )}

        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{ padding: "10px 20px", border: "1px solid var(--border)", background: "transparent", color: "var(--dim)", fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{ padding: "10px 24px", border: "none", background: loading ? "var(--border)" : "var(--g)", color: "#000", fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", transition: "background 0.2s" }}
          >
            {loading ? "Posting…" : "Post Thread"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Thread Card ─────────────────────────────────────────────────────────────────

function ThreadCard({ thread }: { thread: Thread }) {
  return (
    <Link href={`/forum/${thread.id}`} style={{ textDecoration: "none", display: "block" }}>
      <div
        style={{
          background: thread.is_featured ? "rgba(0,255,135,0.03)" : "var(--card)",
          border: `1px solid ${thread.is_featured ? "rgba(0,255,135,0.2)" : "var(--border)"}`,
          borderLeft: thread.is_featured ? "3px solid var(--g)" : "3px solid transparent",
          padding: "20px 24px",
          marginBottom: "1px",
          transition: "background 0.2s",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--dark3)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = thread.is_featured ? "rgba(0,255,135,0.03)" : "var(--card)"; }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
          {/* Left */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Flair + badges */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "8px", letterSpacing: "2px", textTransform: "uppercase", color: CATEGORY_COLORS[thread.flair] ?? "var(--dim)", border: `1px solid ${CATEGORY_COLORS[thread.flair] ?? "var(--dim)"}40`, padding: "2px 8px" }}>
                {thread.flair}
              </span>
              {thread.is_featured && (
                <span style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "8px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--g)", background: "rgba(0,255,135,0.12)", padding: "2px 8px" }}>
                  Featured
                </span>
              )}
              {thread.is_closed && (
                <span style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "8px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--dim)", border: "1px solid var(--border)", padding: "2px 8px" }}>
                  Closed
                </span>
              )}
            </div>

            {/* Title */}
            <div style={{ fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)", fontSize: "clamp(18px, 2vw, 24px)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "-0.5px", color: "var(--text)", lineHeight: 1.1, marginBottom: "10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {thread.title}
            </div>

            {/* Meta */}
            <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--dim)", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {thread.author?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thread.author.avatar_url} alt="" style={{ width: "16px", height: "16px", borderRadius: "50%", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: "16px", height: "16px", borderRadius: "50%", background: "var(--g)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "8px", fontWeight: 900, color: "#000" }}>
                    {(thread.author?.name || thread.author?.username || "?")[0].toUpperCase()}
                  </div>
                )}
                <span>{thread.author?.name || thread.author?.username}</span>
              </div>
              <span style={{ color: "var(--border2)" }}>·</span>
              <span>{timeAgo(thread.created_at)}</span>
            </div>
          </div>

          {/* Right: stats */}
          <div style={{ display: "flex", gap: "20px", flexShrink: 0, alignItems: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)", fontSize: "22px", fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>{thread.upvotes_count}</div>
              <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "8px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--dim)", marginTop: "3px" }}>Likes</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)", fontSize: "22px", fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>{thread.reply_count}</div>
              <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "8px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--dim)", marginTop: "3px" }}>Replies</div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── Category Dropdown ──────────────────────────────────────────────────────────

function CategoryDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "6px 14px",
          border: `1px solid ${value !== "All" ? "var(--g)" : "var(--border)"}`,
          background: value !== "All" ? "rgba(0,255,135,0.08)" : "transparent",
          color: value !== "All" ? "var(--g)" : "var(--dim)",
          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
          fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase",
          cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
        }}
      >
        {value === "All" ? "Category" : value}
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}>
          <path d="M1 2.5L4 5.5L7 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200,
          background: "var(--dark2)", border: "1px solid var(--border)",
          minWidth: "180px", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}>
          {FLAIRS.map((f) => {
            const col = f === "All" ? "var(--dim)" : (CATEGORY_COLORS[f] ?? "var(--dim)");
            const active = value === f;
            return (
              <button
                key={f}
                onClick={() => { onChange(f); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: "8px",
                  width: "100%", textAlign: "left",
                  padding: "9px 14px",
                  background: active ? `${col}18` : "transparent",
                  color: active ? col : "var(--dim)",
                  border: "none", borderBottom: "1px solid var(--border)",
                  fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                  fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase",
                  cursor: "pointer", transition: "background 0.1s",
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--dark3)"; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                {f !== "All" && (
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: col, flexShrink: 0 }} />
                )}
                {f}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ForumPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [flair, setFlair] = useState("All");
  const [sort, setSort] = useState<"newest" | "top">("newest");
  const [page, setPage] = useState(1);
  const [showNewThread, setShowNewThread] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
        setIsAdmin(profile?.is_admin === true);
      }
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchThreads = async () => {
    setLoading(true);
    const params = new URLSearchParams({ sort, page: String(page) });
    if (flair !== "All") params.set("flair", flair);
    const res = await fetch(`/api/forum?${params}`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  };

  useEffect(() => { fetchThreads(); }, [flair, sort, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  return (
    <div style={{ paddingTop: "60px", minHeight: "100vh", background: "var(--dark)" }}>

      {/* Header */}
      <div style={{ borderBottom: "1px solid var(--border)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)", fontSize: "clamp(80px, 14vw, 200px)", fontWeight: 900, letterSpacing: "-6px", color: "transparent", WebkitTextStroke: "1px rgba(0,255,135,0.04)", right: "-20px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", lineHeight: 1, whiteSpace: "nowrap", userSelect: "none" }}>
          THE PITCH
        </div>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "48px 40px 32px", position: "relative", zIndex: 1 }}>
          <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: "var(--g)", marginBottom: "12px" }}>
            Community Forum
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "20px", flexWrap: "wrap" }}>
            <div style={{ fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)", fontSize: "clamp(36px, 5vw, 64px)", fontWeight: 900, textTransform: "uppercase", letterSpacing: "-2px", lineHeight: 0.95, color: "var(--text)" }}>
              The Pitch
            </div>
            {userId ? (
              <button
                onClick={() => setShowNewThread(true)}
                style={{ padding: "12px 28px", background: "var(--g)", color: "#000", border: "none", fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", fontWeight: 700, cursor: "pointer", flexShrink: 0, transition: "background 0.2s" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--g2)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--g)"; }}
              >
                + New Thread
              </button>
            ) : (
              <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "10px", letterSpacing: "1.5px", color: "var(--dim)", textTransform: "uppercase" }}>
                Sign in to post
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "32px 40px 80px" }}>

        {/* Top Thread of the Week */}
        {data?.topThread && data.topThread.upvotes_count > 0 && (
          <Link href={`/forum/${data.topThread.id}`} style={{ textDecoration: "none", display: "block", marginBottom: "32px" }}>
            <div
              style={{ background: "rgba(255,200,0,0.04)", border: "1px solid rgba(255,200,0,0.2)", borderLeft: "3px solid #ffc800", padding: "20px 24px", transition: "background 0.2s", cursor: "pointer" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,200,0,0.07)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,200,0,0.04)"; }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "8px", letterSpacing: "2px", textTransform: "uppercase", color: "#ffc800", background: "rgba(255,200,0,0.12)", padding: "3px 10px" }}>
                  Top Thread This Week
                </span>
                <span style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "8px", letterSpacing: "2px", textTransform: "uppercase", border: "1px solid rgba(0,255,135,0.3)", padding: "2px 8px", color: "var(--g)" }}>
                  {data.topThread.flair}
                </span>
              </div>
              <div style={{ fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)", fontSize: "clamp(20px, 2.5vw, 28px)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "-0.5px", color: "var(--text)", marginBottom: "8px" }}>
                {data.topThread.title}
              </div>
              <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", letterSpacing: "1.5px", color: "var(--dim)", display: "flex", gap: "12px" }}>
                <span>{data.topThread.upvotes_count} likes</span>
                <span>·</span>
                <span>{data.topThread.reply_count} replies</span>
                <span>·</span>
                <span>{data.topThread.author?.name || data.topThread.author?.username}</span>
              </div>
            </div>
          </Link>
        )}

        {/* Filters */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "24px", flexWrap: "wrap" }}>
          <CategoryDropdown value={flair} onChange={(f) => { setFlair(f); setPage(1); }} />
          {flair !== "All" && (
            <button
              onClick={() => { setFlair("All"); setPage(1); }}
              style={{ padding: "6px 12px", border: "1px solid var(--border)", background: "transparent", color: "var(--dim)", fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer" }}
            >
              ✕ Clear
            </button>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
            {(["newest", "top"] as const).map((s) => (
              <button
                key={s}
                onClick={() => { setSort(s); setPage(1); }}
                style={{ padding: "6px 14px", border: `1px solid ${sort === s ? "var(--text)" : "var(--border)"}`, background: sort === s ? "var(--dark3)" : "transparent", color: sort === s ? "var(--text)" : "var(--dim)", fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer", transition: "all 0.15s" }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Thread list */}
        {loading ? (
          <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "11px", color: "var(--dim)", letterSpacing: "2px", textTransform: "uppercase", padding: "40px 0", textAlign: "center" }}>
            Loading…
          </div>
        ) : !data?.threads.length ? (
          <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "11px", color: "var(--dim)", letterSpacing: "2px", textTransform: "uppercase", padding: "60px 0", textAlign: "center", border: "1px solid var(--border)" }}>
            No threads yet. Be the first to post.
          </div>
        ) : (
          <>
            <div style={{ border: "1px solid var(--border)" }}>
              {data.threads.map((thread) => <ThreadCard key={thread.id} thread={thread} />)}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "24px" }}>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    style={{ width: "36px", height: "36px", border: `1px solid ${page === p ? "var(--g)" : "var(--border)"}`, background: page === p ? "rgba(0,255,135,0.1)" : "transparent", color: page === p ? "var(--g)" : "var(--dim)", fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "11px", cursor: "pointer" }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {showNewThread && (
        <NewThreadModal
          isAdmin={isAdmin}
          onClose={() => setShowNewThread(false)}
          onCreated={(id) => { setShowNewThread(false); window.location.href = `/forum/${id}`; }}
        />
      )}
    </div>
  );
}
