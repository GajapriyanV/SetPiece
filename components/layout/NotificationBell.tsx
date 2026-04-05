"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

interface NotificationItem {
  id: string;
  type: "thread_reply" | "reply_reply" | "thread_like" | "reply_like" | "mvp_awarded";
  thread_id: string;
  reply_id: string | null;
  is_read: boolean;
  created_at: string;
  count: number;
  actor: { username: string; avatar_url: string | null } | null;
  thread: { title: string } | null;
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

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    const res = await fetch("/api/notifications");
    if (!res.ok) return;
    const data = await res.json();
    setNotifications(data.notifications ?? []);
    setUnreadCount(data.unreadCount ?? 0);
    setLoaded(true);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const init = async () => {
      await fetchNotifications();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Subscribe to new inserts on this user's notifications only
      channel = supabase
        .channel("notifications-live")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
          () => { fetchNotifications(); }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
          () => { fetchNotifications(); }
        )
        .subscribe();
    };

    init();
    return () => { channel?.unsubscribe(); };
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleOpen = () => {
    setOpen((o) => !o);
    if (!open) fetchNotifications();
  };

  const handleMarkAllRead = async () => {
    await fetch("/api/notifications", { method: "PATCH" });
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const handleNotificationClick = async (notif: NotificationItem) => {
    if (!notif.is_read) {
      await fetch(`/api/notifications/${notif.id}`, { method: "PATCH" });
      setNotifications((prev) => prev.map((n) => n.id === notif.id ? { ...n, is_read: true } : n));
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    if (notif.type === "thread_like") {
      router.push(`/forum/${notif.thread_id}`);
    } else {
      router.push(`/forum/${notif.thread_id}#reply-${notif.reply_id}`);
    }
  };

  if (!loaded) return null;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        style={{
          position: "relative",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "6px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: open ? "var(--text)" : "var(--dim)",
          transition: "color 0.2s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = open ? "var(--text)" : "var(--dim)")}
        aria-label="Notifications"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: "absolute",
            top: "2px",
            right: "2px",
            minWidth: "14px",
            height: "14px",
            borderRadius: "7px",
            background: "var(--red)",
            color: "#fff",
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "8px",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 3px",
            lineHeight: 1,
          }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 12px)",
          right: 0,
          width: "320px",
          background: "var(--dark2)",
          border: "1px solid var(--border)",
          zIndex: 600,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}>
          {/* Header */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid var(--border)",
          }}>
            <span style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "9px",
              letterSpacing: "2px",
              textTransform: "uppercase",
              color: "var(--text)",
            }}>
              Notifications
            </span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                  fontSize: "8px",
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  color: "var(--dim)",
                  transition: "color 0.15s",
                  padding: 0,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--dim)")}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ maxHeight: "360px", overflowY: "auto" }}>
            {notifications.length === 0 ? (
              <div style={{
                padding: "32px 16px",
                textAlign: "center",
                fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                fontSize: "10px",
                color: "var(--dim)",
                letterSpacing: "1px",
              }}>
                No notifications yet.
              </div>
            ) : (
              notifications.map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  style={{
                    width: "100%",
                    background: notif.is_read ? "transparent" : "rgba(255,255,255,0.02)",
                    border: "none",
                    borderBottom: "1px solid var(--border)",
                    padding: "12px 16px",
                    textAlign: "left",
                    cursor: "pointer",
                    display: "flex",
                    gap: "10px",
                    alignItems: "flex-start",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = notif.is_read ? "transparent" : "rgba(255,255,255,0.02)")}
                >
                  {/* Unread dot */}
                  <div style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: notif.is_read ? "transparent" : "var(--g)",
                    flexShrink: 0,
                    marginTop: "4px",
                  }} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                      fontSize: "10px",
                      color: notif.is_read ? "var(--dim)" : "var(--text)",
                      lineHeight: 1.5,
                      marginBottom: "4px",
                    }}>
                      {notif.type === "mvp_awarded" ? (
                        <>
                          <span style={{ color: "#ffc800", fontWeight: 600 }}>MVP</span>
                          {" — your reply was the most voted"}
                        </>
                      ) : (
                        <>
                          <span style={{ fontWeight: 600 }}>
                            @{notif.actor?.username ?? "someone"}
                            {notif.count > 1 && ` and ${notif.count - 1} other${notif.count - 1 > 1 ? "s" : ""}`}
                          </span>
                          {" "}
                          {notif.type === "thread_reply" && "replied to your thread"}
                          {notif.type === "reply_reply" && "replied to your comment"}
                          {notif.type === "thread_like" && "liked your thread"}
                          {notif.type === "reply_like" && "liked your comment"}
                        </>
                      )}
                    </div>
                    <div style={{
                      fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                      fontSize: "9px",
                      color: "var(--dim)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      marginBottom: "4px",
                    }}>
                      {notif.thread?.title ?? ""}
                    </div>
                    <div style={{
                      fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                      fontSize: "8px",
                      color: "var(--dim)",
                      letterSpacing: "1px",
                      opacity: 0.7,
                    }}>
                      {timeAgo(notif.created_at)}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
