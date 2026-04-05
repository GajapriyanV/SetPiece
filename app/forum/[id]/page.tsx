"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CATEGORY_COLORS } from "@/lib/forumCategories";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Author {
  id: string;
  username: string;
  name: string;
  avatar_url: string | null;
}

interface Reply {
  id: string;
  parent_reply_id: string | null;
  body: string;
  upvotes_count: number;
  is_mvp: boolean;
  created_at: string;
  author: Author;
  user_liked: boolean;
  children: Reply[];
}

interface Thread {
  id: string;
  title: string;
  body: string;
  flair: string;
  is_featured: boolean;
  is_closed: boolean;
  upvotes_count: number;
  reply_count: number;
  created_at: string;
  closes_at: string;
  author: Author;
  user_liked: boolean;
}

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

function Avatar({ author, size = 28 }: { author: Author | null; size?: number }) {
  if (!author) return null;
  return author.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={author.avatar_url} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "var(--g)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.4, fontWeight: 900, color: "#000", flexShrink: 0 }}>
      {(author.name || author.username)[0].toUpperCase()}
    </div>
  );
}

// ── Tree helpers ────────────────────────────────────────────────────────────────

function findReply(replies: Reply[], id: string): Reply | null {
  for (const r of replies) {
    if (r.id === id) return r;
    const found = findReply(r.children, id);
    if (found) return found;
  }
  return null;
}

function updateReplyInTree(replies: Reply[], id: string, updater: (r: Reply) => Reply): Reply[] {
  return replies.map((r) => {
    if (r.id === id) return updater(r);
    return { ...r, children: updateReplyInTree(r.children, id, updater) };
  });
}

function removeReplyFromTree(replies: Reply[], id: string): Reply[] {
  return replies
    .filter((r) => r.id !== id)
    .map((r) => ({ ...r, children: removeReplyFromTree(r.children, id) }));
}

function addChildToReply(replies: Reply[], parentId: string, child: Reply): Reply[] {
  return replies.map((r) => {
    if (r.id === parentId) return { ...r, children: [...r.children, child] };
    return { ...r, children: addChildToReply(r.children, parentId, child) };
  });
}

// ── Report Modal ────────────────────────────────────────────────────────────────

const REPORT_REASONS = ["Spam", "Hate speech", "Misinformation", "Harassment", "Off-topic", "Other"];

function ReportModal({ targetType, targetId, onClose }: { targetType: "thread" | "reply"; targetId: string; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!reason) { setError("Select a reason."); return; }
    if (reason === "Other" && !customReason.trim()) { setError("Please describe the issue."); return; }
    setLoading(true);
    const res = await fetch("/api/forum/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_type: targetType, target_id: targetId, reason, custom_reason: customReason }),
    });
    setLoading(false);
    if (res.ok) { setDone(true); setTimeout(onClose, 1500); }
    else { setError("Failed to submit report."); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--dark2)", border: "1px solid var(--border)", width: "100%", maxWidth: "480px", padding: "28px" }}>
        {done ? (
          <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "12px", color: "var(--g)", letterSpacing: "1.5px", textAlign: "center", padding: "20px 0" }}>Report submitted. Thank you.</div>
        ) : (
          <>
            <div style={{ fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)", fontSize: "24px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.5px", color: "var(--text)", marginBottom: "20px" }}>Report</div>
            {error && <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "10px", color: "var(--red)", letterSpacing: "1px", marginBottom: "12px" }}>{error}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
              {REPORT_REASONS.map((r) => (
                <button key={r} onClick={() => setReason(r)} style={{ padding: "10px 14px", border: `1px solid ${reason === r ? "var(--g)" : "var(--border)"}`, background: reason === r ? "rgba(0,255,135,0.08)" : "transparent", color: reason === r ? "var(--g)" : "var(--dim)", fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}>
                  {r}
                </button>
              ))}
            </div>
            {reason === "Other" && (
              <textarea
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                maxLength={200}
                rows={3}
                placeholder="Describe the issue..."
                style={{ width: "100%", background: "var(--dark)", border: "1px solid var(--border)", color: "var(--text)", padding: "10px 14px", fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "12px", outline: "none", resize: "none", boxSizing: "border-box", marginBottom: "16px" }}
              />
            )}
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button onClick={onClose} style={{ padding: "9px 18px", border: "1px solid var(--border)", background: "transparent", color: "var(--dim)", fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer" }}>Cancel</button>
              <button onClick={handleSubmit} disabled={loading} style={{ padding: "9px 18px", border: "none", background: loading ? "var(--border)" : "var(--red)", color: "#fff", fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer" }}>
                {loading ? "Submitting…" : "Submit Report"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Like Button ─────────────────────────────────────────────────────────────────

function LikeButton({ count, liked, onLike, disabled }: { count: number; liked: boolean; onLike: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={disabled ? undefined : onLike}
      style={{
        display: "inline-flex", alignItems: "center", gap: "5px",
        padding: "4px 10px", border: `1px solid ${liked ? "var(--g)" : "var(--border)"}`,
        background: liked ? "rgba(0,255,135,0.08)" : "transparent",
        color: liked ? "var(--g)" : "var(--dim)",
        fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px",
        letterSpacing: "1.5px", textTransform: "uppercase", cursor: disabled ? "default" : "pointer",
        transition: "all 0.15s",
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.borderColor = "var(--g)"; e.currentTarget.style.color = "var(--g)"; } }}
      onMouseLeave={(e) => { if (!disabled) { e.currentTarget.style.borderColor = liked ? "var(--g)" : "var(--border)"; e.currentTarget.style.color = liked ? "var(--g)" : "var(--dim)"; } }}
    >
      <svg width="10" height="10" viewBox="0 0 12 12" fill={liked ? "var(--g)" : "none"} stroke="currentColor" strokeWidth="1.5">
        <path d="M6 10.5C6 10.5 1 7.5 1 4.5C1 3 2 1.5 3.5 1.5C4.5 1.5 5.5 2 6 3C6.5 2 7.5 1.5 8.5 1.5C10 1.5 11 3 11 4.5C11 7.5 6 10.5 6 10.5Z" />
      </svg>
      {count}
    </button>
  );
}

// ── Reply Component ─────────────────────────────────────────────────────────────

function ReplyCard({
  reply, currentUserId, isAdmin, isClosed,
  onLike, onDelete, onReport, onReply, depth = 0,
}: {
  reply: Reply;
  currentUserId: string | null;
  isAdmin: boolean;
  isClosed: boolean;
  onLike: (replyId: string) => void;
  onDelete: (replyId: string) => void;
  onReport: (replyId: string) => void;
  onReply?: (replyId: string) => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const isOwn = currentUserId === reply.author?.id;
  const hasChildren = reply.children.length > 0;

  return (
    <div id={`reply-${reply.id}`} style={{ borderLeft: depth > 0 ? "2px solid var(--border)" : "none", paddingLeft: depth > 0 ? "20px" : "0" }}>
      <div
        style={{
          background: reply.is_mvp ? "rgba(255,200,0,0.04)" : "var(--card)",
          border: `1px solid ${reply.is_mvp ? "rgba(255,200,0,0.25)" : "var(--border)"}`,
          borderLeft: reply.is_mvp ? "3px solid #ffc800" : "3px solid transparent",
          padding: "16px 20px",
          marginBottom: "1px",
        }}
      >
        {/* MVP badge */}
        {reply.is_mvp && (
          <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "8px", letterSpacing: "2px", textTransform: "uppercase", color: "#ffc800", background: "rgba(255,200,0,0.12)", padding: "3px 10px", display: "inline-block", marginBottom: "10px" }}>
            MVP — Most Voted Post
          </div>
        )}

        {/* Author row */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
          <Avatar author={reply.author} size={24} />
          <Link href={`/profile/${reply.author?.username}`} style={{ textDecoration: "none" }}>
            <span style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "10px", letterSpacing: "1px", color: "var(--text)" }} onMouseEnter={(e) => { e.currentTarget.style.color = "var(--g)"; }} onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text)"; }}>
              {reply.author?.name || reply.author?.username}
            </span>
          </Link>
          <span style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", color: "var(--dim)", letterSpacing: "1px" }}>
            {timeAgo(reply.created_at)}
          </span>
        </div>

        {/* Body */}
        <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "13px", color: "var(--text)", lineHeight: 1.6, marginBottom: "12px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {reply.body}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <LikeButton count={reply.upvotes_count} liked={reply.user_liked} onLike={() => onLike(reply.id)} disabled={!currentUserId} />
          {!isClosed && onReply && currentUserId && (
            <button
              onClick={() => onReply(reply.id)}
              style={{ padding: "4px 10px", border: "1px solid var(--border)", background: "transparent", color: "var(--dim)", fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer", transition: "all 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--text)"; e.currentTarget.style.color = "var(--text)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--dim)"; }}
            >
              Reply
            </button>
          )}
          {hasChildren && (
            <button
              onClick={() => setExpanded((e) => !e)}
              style={{ padding: "4px 10px", border: "1px solid transparent", background: "transparent", color: "var(--dim)", fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer", transition: "color 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--dim)"; }}
            >
              {expanded ? "Hide replies" : `${reply.children.length} ${reply.children.length === 1 ? "reply" : "replies"} ↓`}
            </button>
          )}
          {currentUserId && (
            <button
              onClick={() => onReport(reply.id)}
              style={{ padding: "4px 10px", border: "1px solid transparent", background: "transparent", color: "var(--dim)", fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer", transition: "color 0.15s", marginLeft: "auto" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--red)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--dim)"; }}
            >
              Report
            </button>
          )}
          {(isOwn || isAdmin) && (
            <button
              onClick={() => { if (confirm("Delete this reply?")) onDelete(reply.id); }}
              style={{ padding: "4px 10px", border: "1px solid transparent", background: "transparent", color: "var(--dim)", fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer", transition: "color 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--red)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--dim)"; }}
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Children — collapsed by default */}
      {expanded && hasChildren && (
        <div style={{ marginTop: "1px" }}>
          {reply.children.map((child) => (
            <div key={child.id} style={{ marginBottom: "1px" }}>
              <ReplyCard
                reply={child}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                isClosed={isClosed}
                onLike={onLike}
                onDelete={onDelete}
                onReport={onReport}
                onReply={onReply}
                depth={1}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ThreadPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [thread, setThread] = useState<Thread | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [replyBody, setReplyBody] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null); // reply ID being replied to
  const [submitting, setSubmitting] = useState(false);
  const [replyError, setReplyError] = useState("");

  const [reportTarget, setReportTarget] = useState<{ type: "thread" | "reply"; id: string } | null>(null);

  const replyInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const init = async () => {
      // Fetch user info
      const { createClient } = await import("@/utils/supabase/client");
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
        setIsAdmin(profile?.is_admin === true);
      }

      // Fetch thread
      const res = await fetch(`/api/forum/${id}`);
      if (res.status === 404) { setNotFound(true); setLoading(false); return; }
      const data = await res.json();
      setThread(data.thread);
      setReplies(data.replies ?? []);
      setLoading(false);
    };
    init();
  }, [id]);

  const handleThreadLike = async () => {
    if (!currentUserId || !thread) return;
    const res = await fetch(`/api/forum/${id}/like`, { method: "POST" });
    const data = await res.json();
    setThread((t) => t ? { ...t, user_liked: data.liked, upvotes_count: t.upvotes_count + (data.liked ? 1 : -1) } : t);
  };

  const handleReplyLike = async (replyId: string) => {
    if (!currentUserId) return;
    const res = await fetch(`/api/forum/reply/${replyId}/like`, { method: "POST" });
    const data = await res.json();
    const delta = data.liked ? 1 : -1;
    setReplies((prev) => updateReplyInTree(prev, replyId, (r) => ({ ...r, user_liked: data.liked, upvotes_count: r.upvotes_count + delta })));
  };

  const handleReplyDelete = async (replyId: string) => {
    await fetch(`/api/forum/reply/${replyId}`, { method: "DELETE" });
    setReplies((prev) => removeReplyFromTree(prev, replyId));
  };

  const handleThreadDelete = async () => {
    if (!confirm("Delete this thread? This cannot be undone.")) return;
    await fetch(`/api/forum/${id}`, { method: "DELETE" });
    router.push("/forum");
  };

  const handleReplyTo = (replyId: string) => {
    setReplyingTo(replyId);
    setTimeout(() => replyInputRef.current?.focus(), 50);
  };

  const handleSubmitReply = async () => {
    if (!replyBody.trim()) { setReplyError("Reply cannot be empty."); return; }
    setSubmitting(true);
    setReplyError("");
    const res = await fetch(`/api/forum/${id}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: replyBody, parent_reply_id: replyingTo ?? undefined }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setReplyError(data.error ?? "Failed to post reply."); return; }

    const newReply: Reply = { ...data.reply, children: [] };
    if (replyingTo) {
      setReplies((prev) => addChildToReply(prev, replyingTo, newReply));
    } else {
      setReplies((prev) => [...prev, newReply]);
    }
    setReplyBody("");
    setReplyingTo(null);
    setThread((t) => t ? { ...t, reply_count: t.reply_count + 1 } : t);
  };

  if (loading) {
    return (
      <div style={{ paddingTop: "60px", minHeight: "100vh", background: "var(--dark)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "11px", color: "var(--dim)", letterSpacing: "2px", textTransform: "uppercase" }}>Loading…</div>
      </div>
    );
  }

  if (notFound || !thread) {
    return (
      <div style={{ paddingTop: "60px", minHeight: "100vh", background: "var(--dark)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px" }}>
        <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "11px", color: "var(--red)", letterSpacing: "2px", textTransform: "uppercase" }}>Thread not found.</div>
        <Link href="/forum" style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "10px", color: "var(--dim)", letterSpacing: "2px", textTransform: "uppercase", textDecoration: "none", borderBottom: "1px solid var(--border2)" }}>← Back to Forum</Link>
      </div>
    );
  }

  const isOwn = currentUserId === thread.author?.id;
  const replyingToReply = replyingTo ? findReply(replies, replyingTo) : null;

  return (
    <div style={{ paddingTop: "60px", minHeight: "100vh", background: "var(--dark)" }}>

      {/* Back nav */}
      <div style={{ borderBottom: "1px solid var(--border)", padding: "16px 40px", maxWidth: "1200px", margin: "0 auto" }}>
        <Link href="/forum" style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "10px", color: "var(--dim)", letterSpacing: "2px", textTransform: "uppercase", textDecoration: "none", transition: "color 0.15s" }} onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }} onMouseLeave={(e) => { e.currentTarget.style.color = "var(--dim)"; }}>
          ← The Pitch
        </Link>
      </div>

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "32px 40px 80px" }}>

        {/* Thread */}
        <div style={{
          background: "var(--dark2)", border: "1px solid var(--border)",
          borderLeft: thread.is_featured ? "3px solid var(--g)" : thread.is_closed ? "3px solid var(--border2)" : "3px solid transparent",
          marginBottom: "24px",
        }}>
          {/* Closed banner */}
          {thread.is_closed && (
            <div style={{ background: "rgba(85,85,102,0.15)", borderBottom: "1px solid var(--border)", padding: "10px 24px", fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--dim)", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: "var(--dim)" }} />
              Thread closed · Replies disabled
            </div>
          )}

          <div style={{ padding: "28px 28px 24px" }}>
            {/* Flair */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "8px", letterSpacing: "2px", textTransform: "uppercase", color: CATEGORY_COLORS[thread.flair] ?? "var(--dim)", border: `1px solid ${CATEGORY_COLORS[thread.flair] ?? "var(--dim)"}40`, padding: "2px 8px" }}>{thread.flair}</span>
              {thread.is_featured && <span style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "8px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--g)", background: "rgba(0,255,135,0.12)", padding: "2px 8px" }}>Featured</span>}
            </div>

            {/* Title */}
            <div style={{ fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)", fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 900, textTransform: "uppercase", letterSpacing: "-1.5px", lineHeight: 0.95, color: "var(--text)", marginBottom: "20px" }}>
              {thread.title}
            </div>

            {/* Author */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
              <Avatar author={thread.author} size={28} />
              <Link href={`/profile/${thread.author?.username}`} style={{ textDecoration: "none" }}>
                <span style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "11px", letterSpacing: "1px", color: "var(--text)" }} onMouseEnter={(e) => { e.currentTarget.style.color = "var(--g)"; }} onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text)"; }}>
                  {thread.author?.name || thread.author?.username}
                </span>
              </Link>
              <span style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", color: "var(--dim)" }}>{timeAgo(thread.created_at)}</span>
              {!thread.is_closed && (
                <span style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", color: "var(--dim)", marginLeft: "4px" }}>
                  · Closes {new Date(thread.closes_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
              )}
            </div>

            {/* Body */}
            <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "14px", color: "var(--text)", lineHeight: 1.7, marginBottom: "20px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {thread.body}
            </div>

            {/* Actions */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <LikeButton count={thread.upvotes_count} liked={thread.user_liked} onLike={handleThreadLike} disabled={!currentUserId} />
              <span style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", color: "var(--dim)", letterSpacing: "1px" }}>
                {thread.reply_count} {thread.reply_count === 1 ? "reply" : "replies"}
              </span>
              {currentUserId && (
                <button onClick={() => setReportTarget({ type: "thread", id: thread.id })} style={{ marginLeft: "auto", padding: "4px 10px", border: "1px solid transparent", background: "transparent", color: "var(--dim)", fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer", transition: "color 0.15s" }} onMouseEnter={(e) => { e.currentTarget.style.color = "var(--red)"; }} onMouseLeave={(e) => { e.currentTarget.style.color = "var(--dim)"; }}>
                  Report
                </button>
              )}
              {(isOwn || isAdmin) && (
                <button onClick={handleThreadDelete} style={{ padding: "4px 10px", border: "1px solid transparent", background: "transparent", color: "var(--dim)", fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer", transition: "color 0.15s" }} onMouseEnter={(e) => { e.currentTarget.style.color = "var(--red)"; }} onMouseLeave={(e) => { e.currentTarget.style.color = "var(--dim)"; }}>
                  Delete Thread
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={async () => {
                    await fetch(`/api/forum/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_featured: !thread.is_featured }) });
                    setThread((t) => t ? { ...t, is_featured: !t.is_featured } : t);
                  }}
                  style={{ padding: "4px 10px", border: "1px solid var(--border)", background: "transparent", color: "var(--dim)", fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer", transition: "all 0.15s" }}
                >
                  {thread.is_featured ? "Unfeature" : "Feature"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Replies section header */}
        <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: "var(--dim)", marginBottom: "16px" }}>
          {replies.length} {replies.length === 1 ? "Reply" : "Replies"}
        </div>

        {/* Replies */}
        {replies.length > 0 && (
          <div style={{ marginBottom: "32px" }}>
            {replies.map((reply) => (
              <div key={reply.id} style={{ marginBottom: "2px" }}>
                <ReplyCard
                  reply={reply}
                  currentUserId={currentUserId}
                  isAdmin={isAdmin}
                  isClosed={thread.is_closed}
                  onLike={handleReplyLike}
                  onDelete={handleReplyDelete}
                  onReport={(replyId) => setReportTarget({ type: "reply", id: replyId })}
                  onReply={handleReplyTo}
                />
              </div>
            ))}
          </div>
        )}

        {/* Reply input */}
        {!thread.is_closed && currentUserId ? (
          <div style={{ background: "var(--dark2)", border: "1px solid var(--border)", padding: "20px 24px" }}>
            {replyingToReply && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px", padding: "8px 12px", background: "var(--dark3)", border: "1px solid var(--border)" }}>
                <span style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--dim)" }}>
                  Replying to {replyingToReply.author?.name || replyingToReply.author?.username}
                </span>
                <button onClick={() => setReplyingTo(null)} style={{ marginLeft: "auto", background: "transparent", border: "none", color: "var(--dim)", cursor: "pointer", fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "10px" }}>✕</button>
              </div>
            )}
            {replyError && <div style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "10px", color: "var(--red)", letterSpacing: "1px", marginBottom: "10px" }}>{replyError}</div>}
            <textarea
              ref={replyInputRef}
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder={replyingTo ? "Write your reply…" : "Add to the debate…"}
              style={{ width: "100%", background: "var(--dark)", border: "1px solid var(--border)", color: "var(--text)", padding: "10px 14px", fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "12px", outline: "none", resize: "vertical", boxSizing: "border-box", marginBottom: "12px" }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={handleSubmitReply}
                disabled={submitting}
                style={{ padding: "10px 24px", border: "none", background: submitting ? "var(--border)" : "var(--g)", color: "#000", fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer" }}
              >
                {submitting ? "Posting…" : "Post Reply"}
              </button>
            </div>
          </div>
        ) : thread.is_closed ? (
          <div style={{ padding: "20px 24px", border: "1px solid var(--border)", fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "10px", color: "var(--dim)", letterSpacing: "2px", textTransform: "uppercase", textAlign: "center" }}>
            This thread is closed. No new replies.
          </div>
        ) : (
          <div style={{ padding: "20px 24px", border: "1px solid var(--border)", fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "10px", color: "var(--dim)", letterSpacing: "2px", textTransform: "uppercase", textAlign: "center" }}>
            Sign in to reply
          </div>
        )}
      </div>

      {reportTarget && (
        <ReportModal
          targetType={reportTarget.type}
          targetId={reportTarget.id}
          onClose={() => setReportTarget(null)}
        />
      )}
    </div>
  );
}
