"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [focused, setFocused] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleReset = async () => {
    setError("");
    if (!password) {
      setError("Please enter a new password");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/");
  };

  const inputStyle = (key: string) => ({
    width: "100%", padding: "12px 14px",
    background: "var(--dark2)",
    border: `1px solid ${focused === key ? "var(--g)" : "var(--border2)"}`,
    borderRadius: "2px", outline: "none",
    fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
    fontSize: "12px", color: "var(--text)",
    letterSpacing: "2px",
    transition: "border-color 0.2s",
    boxSizing: "border-box" as const,
  });

  const labelStyle = {
    display: "block",
    fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
    fontSize: "9px", color: "var(--dim)", letterSpacing: "2px",
    textTransform: "uppercase" as const, marginBottom: "8px",
  };

  return (
    <div style={{
      minHeight: "100vh", background: "var(--dark)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "70px 20px 20px",
    }}>
      <div style={{
        width: "100%", maxWidth: "500px",
        background: "var(--card)", border: "1px solid var(--border2)",
        borderRadius: "4px", overflow: "hidden",
        animation: "fu 0.7s cubic-bezier(0.16, 1, 0.3, 1) both",
      }}>

        {/* Top bar */}
        <div style={{
          display: "flex", alignItems: "center",
          padding: "20px 24px", borderBottom: "1px solid var(--border)",
        }}>
          <div style={{
            fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
            fontSize: "16px", fontWeight: 600, letterSpacing: "4px",
            textTransform: "uppercase", color: "var(--text)",
            display: "flex", alignItems: "center", gap: "2px",
          }}>
            SET <span style={{ color: "var(--g)", fontWeight: 300, margin: "0 2px" }}>/</span> PIECE
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "28px 24px 24px" }}>
          <h2 style={{
            fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)",
            fontSize: "36px", fontWeight: 900, textTransform: "uppercase",
            letterSpacing: "-1px", lineHeight: 1, color: "var(--text)",
            marginBottom: "8px",
          }}>
            New Password
          </h2>
          <p style={{
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "10px", color: "var(--dim)", letterSpacing: "2px",
            textTransform: "uppercase", marginBottom: "24px",
          }}>
            Choose a new password for your account
          </p>

          {error && (
            <div style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "10px", color: "var(--red)", letterSpacing: "1.5px",
              textTransform: "uppercase", marginBottom: "16px",
            }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: "14px" }}>
            <label style={labelStyle}>New Password</label>
            <input
              type="password"
              placeholder="········"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setFocused("password")}
              onBlur={() => setFocused("")}
              style={inputStyle("password")}
            />
          </div>

          <div style={{ marginBottom: "24px" }}>
            <label style={labelStyle}>Confirm Password</label>
            <input
              type="password"
              placeholder="········"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onFocus={() => setFocused("confirm")}
              onBlur={() => setFocused("")}
              style={inputStyle("confirm")}
            />
          </div>

          <button
            onClick={handleReset}
            disabled={loading}
            style={{
              width: "100%", padding: "16px",
              background: "var(--g)", color: "#000",
              border: "none", borderRadius: "2px",
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "13px", fontWeight: 700, letterSpacing: "3px",
              textTransform: "uppercase", cursor: loading ? "default" : "pointer",
              transition: "background 0.2s",
              opacity: loading ? 0.6 : 1,
            }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = "var(--g2)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--g)"; }}
          >
            {loading ? "Updating..." : "Update Password →"}
          </button>
        </div>
      </div>
    </div>
  );
}
