"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { COUNTRIES } from "@/lib/data/countries";
import { ALL_CLUBS, CLUB_NAMES as CLUBS } from "@/lib/data/clubs";
import SearchableSelect from "@/components/ui/SearchableSelect";

const CLUB_LEAGUE_MAP: Record<string, string> = Object.fromEntries(
  ALL_CLUBS.map((c) => [c.name, c.league])
);

interface EditProfileModalProps {
  initial: {
    name: string;
    username: string;
    country: string | null;
    club: string | null;
    username_changed_at: string | null;
    avatar_url: string | null;
  };
  onClose: () => void;
  onSaved: (updated: { name: string; username: string; country: string | null; club: string | null; username_changed_at: string | null; avatar_url: string | null }) => void;
}

export default function EditProfileModal({ initial, onClose, onSaved }: EditProfileModalProps) {
  const supabase = createClient();
  const overlayRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(initial.avatar_url);
  const [avatarError, setAvatarError] = useState("");
  const [avatarHovered, setAvatarHovered] = useState(false);

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

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const setField = (field: string) => (value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setAvatarError("File must be an image");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError("Image must be under 2MB");
      return;
    }
    setAvatarError("");
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

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

    if (avatarError) return;

    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    // Upload avatar if a new file was selected
    let newAvatarUrl: string | null = initial.avatar_url;
    if (avatarFile) {
      const ext = avatarFile.name.split(".").pop() ?? "jpg";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, avatarFile, { upsert: true });
      if (uploadError) {
        setError("Photo upload failed: " + uploadError.message);
        setLoading(false);
        return;
      }
      newAvatarUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    }

    const now = new Date().toISOString();
    const { error: dbError } = await supabase.from("profiles").update({
      name: form.name.trim(),
      username: form.username.trim(),
      country: form.country || null,
      club: form.club || null,
      updated_at: now,
      ...(usernameChanged ? { username_changed_at: now } : {}),
      ...(newAvatarUrl !== initial.avatar_url ? { avatar_url: newAvatarUrl } : {}),
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
        avatar_url: newAvatarUrl,
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

          {/* Avatar */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "24px" }}>
            <div
              onClick={() => fileInputRef.current?.click()}
              onMouseEnter={() => setAvatarHovered(true)}
              onMouseLeave={() => setAvatarHovered(false)}
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "50%",
                background: avatarPreview ? "transparent" : "linear-gradient(135deg, var(--g), #00c06a)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)",
                fontSize: "26px",
                fontWeight: 900,
                color: "#000",
                flexShrink: 0,
                overflow: "hidden",
                cursor: "pointer",
                position: "relative",
                boxShadow: avatarHovered ? "0 0 0 2px var(--g)" : "0 0 0 2px rgba(0,255,135,0.25)",
                transition: "box-shadow 0.2s",
              }}
            >
              {avatarPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarPreview} alt="Avatar preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                (form.name || form.username || "?")[0].toUpperCase()
              )}
              {/* Hover overlay */}
              <div style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.55)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: avatarHovered ? 1 : 0,
                transition: "opacity 0.2s",
              }}>
                <span style={{ fontSize: "18px", lineHeight: 1 }}>📷</span>
              </div>
            </div>
            <div>
              <div style={{
                fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                fontSize: "9px",
                color: "var(--dim)",
                letterSpacing: "2px",
                textTransform: "uppercase",
                marginBottom: "4px",
              }}>
                Profile Photo
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  background: "transparent",
                  border: "1px solid var(--border2)",
                  borderRadius: "2px",
                  color: "var(--dim)",
                  fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                  fontSize: "9px",
                  letterSpacing: "2px",
                  textTransform: "uppercase",
                  padding: "6px 12px",
                  cursor: "pointer",
                  transition: "border-color 0.2s, color 0.2s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--g)"; e.currentTarget.style.color = "var(--g)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = "var(--dim)"; }}
              >
                Choose Image
              </button>
              <div style={{
                fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                fontSize: "8px",
                color: "var(--dim)",
                letterSpacing: "1px",
                marginTop: "4px",
                opacity: 0.6,
              }}>
                JPG, PNG, WEBP · Max 2MB
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
          </div>
          {avatarError && (
            <div style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "9px",
              color: "var(--red)",
              letterSpacing: "1px",
              marginBottom: "14px",
              marginTop: "-16px",
            }}>
              {avatarError}
            </div>
          )}

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
            <SearchableSelect
              label="Country"
              placeholder="Search countries..."
              options={COUNTRIES}
              value={form.country}
              onChange={setField("country")}
              fieldKey="country"
              focused={focused}
              onFocus={setFocused}
              onBlur={() => setFocused("")}
            />
          </div>

          {/* Favourite Club */}
          <div style={{ marginBottom: "24px" }}>
            <SearchableSelect
              label="Favourite Club"
              placeholder="Search clubs..."
              options={CLUBS}
              value={form.club}
              onChange={setField("club")}
              fieldKey="club"
              focused={focused}
              onFocus={setFocused}
              onBlur={() => setFocused("")}
              subtitleMap={CLUB_LEAGUE_MAP}
            />
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
