"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";

const CLUBS = [
  "Arsenal", "Aston Villa", "Atletico Madrid", "Bayern Munich", "Barcelona",
  "Borussia Dortmund", "Chelsea", "Everton", "Inter Milan", "Juventus",
  "Liverpool", "Manchester City", "Manchester United", "Milan", "Napoli",
  "Newcastle United", "Paris Saint-Germain", "Real Madrid", "Roma",
  "Tottenham Hotspur", "West Ham United",
];

const COUNTRIES = [
  "Argentina", "Belgium", "Brazil", "Colombia", "Croatia", "England",
  "France", "Germany", "Italy", "Netherlands", "Norway", "Portugal",
  "Senegal", "Spain", "United States", "Uruguay", "Other",
];

interface EditProfileModalProps {
  initial: {
    name: string;
    username: string;
    country: string | null;
    club: string | null;
    username_changed_at: string | null;
  };
  onClose: () => void;
  onSaved: (updated: { name: string; username: string; country: string | null; club: string | null; username_changed_at: string | null }) => void;
}

export default function EditProfileModal({ initial, onClose, onSaved }: EditProfileModalProps) {
  const supabase = createClient();
  const overlayRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    name: initial.name ?? "",
    username: initial.username ?? "",
    country: initial.country ?? "",
    club: initial.club ?? "",
  });
  const [focused, setFocused] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [usernameError, setUsernameError] = useState("");

  const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 2 weeks

  const usernameChanged = form.username.trim() !== initial.username;

  const cooldownRemaining = (): string | null => {
    const elapsed = Date.now() - new Date(initial.username_changed_at ?? 0).getTime();
    if (elapsed >= COOLDOWN_MS) return null;
    const daysLeft = Math.ceil((COOLDOWN_MS - elapsed) / (1000 * 60 * 60 * 24));
    return `${daysLeft} day${daysLeft !== 1 ? "s" : ""}`;
  };

  const checkUsernameAvailable = async (value: string) => {
    if (!value.trim() || value.trim() === initial.username) {
      setUsernameError("");
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", value.trim())
      .maybeSingle();
    setUsernameError(data ? "Username already taken" : "");
  };

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSave = async () => {
    setError("");
    if (!form.name.trim() || !form.username.trim()) {
      setError("Name and username are required");
      return;
    }

    // Cooldown check
    if (usernameChanged) {
      const remaining = cooldownRemaining();
      if (remaining) {
        setError(`You can change your username again in ${remaining}`);
        return;
      }
      if (usernameError) {
        setError(usernameError);
        return;
      }
      // Final uniqueness check in case the user didn't blur
      const { data: taken } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", form.username.trim())
        .maybeSingle();
      if (taken) {
        setError("Username already taken");
        return;
      }
    }

    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    const now = new Date().toISOString();
    const { error: dbError } = await supabase.from("profiles").update({
      name: form.name.trim(),
      username: form.username.trim(),
      country: form.country || null,
      club: form.club || null,
      updated_at: now,
      ...(usernameChanged ? { username_changed_at: now } : {}),
    }).eq("id", user.id);

    setLoading(false);

    if (dbError) {
      setError(dbError.message);
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      onSaved({
        name: form.name.trim(),
        username: form.username.trim(),
        country: form.country || null,
        club: form.club || null,
        username_changed_at: usernameChanged ? now : initial.username_changed_at,
      });
    }, 600);
  };

  const inputStyle = (field: string) => ({
    width: "100%",
    padding: "12px 14px",
    background: "var(--dark2)",
    border: `1px solid ${focused === field ? "var(--g)" : "var(--border2)"}`,
    borderRadius: "2px",
    outline: "none",
    fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
    fontSize: "12px",
    color: "var(--text)",
    letterSpacing: "1px",
    transition: "border-color 0.2s",
    boxSizing: "border-box" as const,
  });

  const labelStyle = {
    display: "block",
    fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
    fontSize: "9px",
    color: "var(--dim)",
    letterSpacing: "2px",
    textTransform: "uppercase" as const,
    marginBottom: "8px",
  };

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(6,6,8,0.92)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        animation: "fu 0.25s ease both",
      }}
    >
      <div style={{
        width: "100%",
        maxWidth: "480px",
        background: "var(--card)",
        border: "1px solid var(--border2)",
        borderRadius: "4px",
        overflow: "hidden",
        position: "relative",
        animation: "fu 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.05s both",
      }}>

        {/* Top bar */}
        <div style={{
          padding: "18px 24px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div style={{
            fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
            fontSize: "14px",
            fontWeight: 600,
            letterSpacing: "3px",
            textTransform: "uppercase",
            color: "var(--text)",
          }}>
            Edit Profile
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--dim)",
              cursor: "pointer",
              fontSize: "20px",
              lineHeight: 1,
              padding: "0 2px",
              transition: "color 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--dim)")}
          >
            ×
          </button>
        </div>

        {/* Form */}
        <div style={{ padding: "28px 24px 24px" }}>

          {/* Display Name */}
          <div style={{ marginBottom: "14px" }}>
            <label style={labelStyle}>Display Name</label>
            <input
              type="text"
              placeholder="Your name"
              value={form.name}
              onChange={set("name")}
              onFocus={() => setFocused("name")}
              onBlur={() => setFocused("")}
              style={inputStyle("name")}
            />
          </div>

          {/* Username */}
          <div style={{ marginBottom: "14px" }}>
            <label style={labelStyle}>Username</label>
            <input
              type="text"
              placeholder="your_handle"
              value={form.username}
              onChange={(e) => { set("username")(e); setUsernameError(""); }}
              onFocus={() => setFocused("username")}
              onBlur={(e) => { setFocused(""); checkUsernameAvailable(e.target.value); }}
              style={{ ...inputStyle("username"), borderColor: usernameError ? "var(--red)" : focused === "username" ? "var(--g)" : "var(--border2)" }}
            />
            {usernameError && (
              <div style={{
                fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                fontSize: "9px",
                color: "var(--red)",
                letterSpacing: "1px",
                marginTop: "6px",
              }}>
                {usernameError}
              </div>
            )}
            {usernameChanged && !usernameError && (() => {
              const remaining = cooldownRemaining();
              return remaining ? (
                <div style={{
                  fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                  fontSize: "9px",
                  color: "var(--red)",
                  letterSpacing: "1px",
                  marginTop: "6px",
                }}>
                  Username change locked for {remaining}
                </div>
              ) : null;
            })()}
          </div>

          {/* Country */}
          <div style={{ marginBottom: "14px" }}>
            <label style={labelStyle}>Country</label>
            <select
              value={form.country}
              onChange={set("country")}
              onFocus={() => setFocused("country")}
              onBlur={() => setFocused("")}
              style={{ ...inputStyle("country"), appearance: "none" as const }}
            >
              <option value="">Not specified</option>
              {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Favourite Club */}
          <div style={{ marginBottom: "24px" }}>
            <label style={labelStyle}>Favourite Club</label>
            <select
              value={form.club}
              onChange={set("club")}
              onFocus={() => setFocused("club")}
              onBlur={() => setFocused("")}
              style={{ ...inputStyle("club"), appearance: "none" as const }}
            >
              <option value="">Not specified</option>
              {CLUBS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "10px",
              color: "var(--red)",
              letterSpacing: "1px",
              marginBottom: "14px",
            }}>
              {error}
            </div>
          )}

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={loading || success}
            style={{
              width: "100%",
              padding: "13px",
              background: success ? "rgba(0,255,135,0.15)" : "var(--g)",
              color: success ? "var(--g)" : "#000",
              border: success ? "1px solid rgba(0,255,135,0.3)" : "none",
              borderRadius: "2px",
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "3px",
              textTransform: "uppercase",
              cursor: loading || success ? "default" : "pointer",
              transition: "background 0.2s, color 0.2s",
              opacity: loading ? 0.7 : 1,
            }}
            onMouseEnter={(e) => {
              if (!loading && !success) e.currentTarget.style.background = "var(--g2)";
            }}
            onMouseLeave={(e) => {
              if (!loading && !success) e.currentTarget.style.background = "var(--g)";
            }}
          >
            {success ? "Saved ✓" : loading ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
