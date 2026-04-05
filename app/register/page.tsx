"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { COUNTRIES } from "@/lib/data/countries";
import { ALL_CLUBS, CLUB_NAMES } from "@/lib/data/clubs";

const CLUB_LEAGUE_MAP: Record<string, string> = Object.fromEntries(
  ALL_CLUBS.map((c) => [c.name, c.league])
);

const OAUTH_PROVIDERS: { label: string; provider: "google" | "twitter" | "discord"; icon: React.ReactNode }[] = [
  {
    label: "Continue with Google",
    provider: "google",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    ),
  },
  {
    label: "Continue with X / Twitter",
    provider: "twitter",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    ),
  },
  {
    label: "Continue with Discord",
    provider: "discord",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
      </svg>
    ),
  },
];

const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
  fontSize: "9px", color: "var(--dim)", letterSpacing: "2px",
  textTransform: "uppercase", marginBottom: "6px",
};

const errorStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
  fontSize: "10px", color: "var(--red)", letterSpacing: "1.5px",
  textTransform: "uppercase", marginBottom: "12px",
};

const STEP_TITLES = [
  { heading: "Create Account", sub: "Join the debate — free forever" },
  { heading: "Your Profile",   sub: "Tell us a bit about yourself"   },
  { heading: "All Set",        sub: "Review your details"            },
];

function getPasswordErrors(pw: string): string[] {
  const errs: string[] = [];
  if (pw.length < 8)            errs.push("At least 8 characters");
  if (!/[A-Z]/.test(pw))        errs.push("At least 1 uppercase letter");
  if (!/[a-z]/.test(pw))        errs.push("At least 1 lowercase letter");
  if (!/[^A-Za-z0-9]/.test(pw)) errs.push("At least 1 special character");
  return errs;
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterContent />
    </Suspense>
  );
}

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // complete=1 → user is already authenticated (OAuth or returning email user), just needs profile
  const isComplete = searchParams.get("complete") === "1";

  const supabase = createClient();
  const [step, setStep] = useState(isComplete ? 2 : 1);
  const [focused, setFocused] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);
  // Whether the current user already has a username (email/password users who passed step 1)
  const [hasUsername, setHasUsername] = useState(false);
  const [form, setForm] = useState({
    username: "", email: "", password: "", confirm: "",
    name: "", country: "", club: "",
  });

  // In complete mode: pre-fill name from auth metadata, check if username already set
  useEffect(() => {
    if (!isComplete) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      const meta = user.user_metadata ?? {};
      const existingUsername = meta.username ?? "";
      setHasUsername(!!existingUsername);
      setForm((prev) => ({
        ...prev,
        name: meta.full_name ?? meta.name ?? prev.name,
        username: existingUsername || prev.username,
      }));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isComplete]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  const setField = (key: string) => (value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const inputStyle = (key: string): React.CSSProperties => ({
    width: "100%", padding: "10px 14px",
    background: "var(--dark2)",
    border: `1px solid ${focused === key ? "var(--g)" : "var(--border2)"}`,
    borderRadius: "2px", outline: "none",
    fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
    fontSize: "12px", color: "var(--text)",
    letterSpacing: "1px", transition: "border-color 0.2s",
    boxSizing: "border-box",
  });

  const backBtn: React.CSSProperties = {
    flex: 1, padding: "12px", background: "transparent", color: "var(--dim)",
    border: "1px solid var(--border2)", borderRadius: "2px",
    fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
    fontSize: "12px", fontWeight: 700, letterSpacing: "3px",
    textTransform: "uppercase", cursor: "pointer", transition: "all 0.2s",
  };

  const nextBtn: React.CSSProperties = {
    flex: 2, padding: "12px", background: "var(--g)", color: "#000",
    border: "none", borderRadius: "2px",
    fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
    fontSize: "12px", fontWeight: 700, letterSpacing: "3px",
    textTransform: "uppercase", cursor: "pointer", transition: "background 0.2s",
  };

  const handleOAuth = async (provider: "google" | "twitter" | "discord") => {
    setError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
  };

  // Step 1: create auth credentials (email/password only)
  const handleSignUp = async () => {
    setError("");
    if (!form.username.trim()) { setError("Username is required"); return; }
    if (!form.email.trim())    { setError("Email is required"); return; }
    if (!form.password)        { setError("Password is required"); return; }
    if (form.password !== form.confirm) { setError("Passwords do not match"); return; }
    const pwErrors = getPasswordErrors(form.password);
    if (pwErrors.length > 0) { setError(pwErrors[0]); return; }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { username: form.username } },
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setStep(2);
  };

  // Step 2 → 3: validate profile fields
  const handleStep2Next = () => {
    setError("");
    // Username required if not already set from step 1 or OAuth metadata
    if (!hasUsername && !form.username.trim()) {
      setError("Username is required");
      return;
    }
    // Name is always required
    if (!form.name.trim()) {
      setError("Full name is required");
      return;
    }
    // If country/club entered, must be from the valid list
    if (form.country && !COUNTRIES.includes(form.country)) {
      setError("Please select a valid country from the list");
      return;
    }
    if (form.club && !CLUB_NAMES.includes(form.club)) {
      setError("Please select a valid club from the list");
      return;
    }
    setStep(3);
  };

  // Final step: write profile row + mark onboarding complete in auth metadata
  const handleCreateAccount = async () => {
    setError("");
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Session lost. Please sign in again.");
      setLoading(false);
      return;
    }

    const resolvedUsername = form.username.trim() || user.user_metadata?.username || null;

    // Write profile row
    const { error: profileError } = await supabase.from("profiles").upsert({
      id: user.id,
      username: resolvedUsername,
      name: form.name,
      country: form.country || null,
      club: form.club || null,
      registration_complete: true,
    });
    if (profileError) {
      setError(profileError.message);
      setLoading(false);
      return;
    }

    // Mark onboarding complete in auth metadata — proxy reads this without a DB query.
    // Do NOT mirror username here: profiles.username is canonical; writing it to
    // user_metadata would go stale if the user later changes their handle.
    const { error: metaError } = await supabase.auth.updateUser({
      data: { onboarding_complete: true },
    });
    if (metaError) {
      // Non-fatal: profile is written. Log and continue.
      console.error("[register] updateUser error:", metaError.message);
    }

    setLoading(false);
    router.push("/");
  };

  const passwordErrors = passwordTouched ? getPasswordErrors(form.password) : [];
  void passwordErrors; // used inline below
  const { heading, sub } = STEP_TITLES[step - 1];

  // Show sign-out when user is already authenticated (step 2+, or complete mode)
  const showSignOut = isComplete || step > 1;

  return (
    <div style={{
      minHeight: "100vh", background: "var(--dark)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "70px 20px 20px",
    }}>
      <div className="r-modal" style={{
        width: "100%", maxWidth: "500px",
        background: "var(--card)", border: "1px solid var(--border2)",
        borderRadius: "4px", overflow: "hidden",
        animation: "fu 0.7s cubic-bezier(0.16, 1, 0.3, 1) both",
      }}>

        {/* Top bar */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 24px", borderBottom: "1px solid var(--border)",
        }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <Image src="/logo.png" alt="SetPiece" width={200} height={60} style={{ display: "block", height: "28px", width: "auto" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {showSignOut && (
              <button
                onClick={handleSignOut}
                style={{
                  background: "none", border: "none", padding: 0,
                  fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                  fontSize: "9px", color: "var(--dim)", letterSpacing: "2px",
                  textTransform: "uppercase", cursor: "pointer", transition: "color 0.2s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--dim)"; }}
              >
                Sign Out
              </button>
            )}
            <div style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "9px", color: "var(--dim)", letterSpacing: "2px",
              textTransform: "uppercase",
            }}>
              {isComplete ? "Complete Profile" : `Step ${step} of 3`}
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 24px" }}>

          <h2 style={{
            fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)",
            fontSize: "36px", fontWeight: 900, textTransform: "uppercase",
            letterSpacing: "-1px", lineHeight: 1, color: "var(--text)",
            marginBottom: "4px",
          }}>
            {heading}
          </h2>
          <p style={{
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "10px", color: "var(--dim)", letterSpacing: "2px",
            textTransform: "uppercase", marginBottom: "16px",
          }}>
            {sub}
          </p>

          {error && <div style={errorStyle}>{error}</div>}

          {/* ── Step 1: credentials (email/password path only) ── */}
          {step === 1 && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
                {OAUTH_PROVIDERS.map((btn) => (
                  <button
                    key={btn.label}
                    onClick={() => handleOAuth(btn.provider)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      gap: "12px", width: "100%", padding: "10px",
                      background: "var(--dark2)", border: "1px solid var(--border2)",
                      borderRadius: "2px",
                      fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                      fontSize: "11px", fontWeight: 500, letterSpacing: "2px",
                      textTransform: "uppercase", color: "var(--text)",
                      cursor: "pointer", transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)";
                      e.currentTarget.style.background = "var(--dark3)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--border2)";
                      e.currentTarget.style.background = "var(--dark2)";
                    }}
                  >
                    {btn.icon} {btn.label}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px" }}>
                <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
                <span style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "10px", color: "var(--dim)", letterSpacing: "3px" }}>OR</span>
                <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
              </div>

              <div style={{ marginBottom: "10px" }}>
                <label style={labelStyle}>Username <span style={{ color: "var(--red)" }}>*</span></label>
                <input type="text" placeholder="your_handle" value={form.username}
                  onChange={set("username")} onFocus={() => setFocused("username")} onBlur={() => setFocused("")}
                  style={inputStyle("username")} />
              </div>
              <div style={{ marginBottom: "10px" }}>
                <label style={labelStyle}>Email <span style={{ color: "var(--red)" }}>*</span></label>
                <input type="email" placeholder="you@example.com" value={form.email}
                  onChange={set("email")} onFocus={() => setFocused("email")} onBlur={() => setFocused("")}
                  style={inputStyle("email")} />
              </div>
              <div style={{ marginBottom: "6px" }}>
                <label style={labelStyle}>Password <span style={{ color: "var(--red)" }}>*</span></label>
                <input type="password" placeholder="········" value={form.password}
                  onChange={(e) => { set("password")(e); setPasswordTouched(true); }}
                  onFocus={() => setFocused("password")} onBlur={() => setFocused("")}
                  style={{ ...inputStyle("password"), letterSpacing: "2px" }} />
                {passwordTouched && form.password.length > 0 && (
                  <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "3px" }}>
                    {[
                      { rule: form.password.length >= 8,            label: "8+ characters" },
                      { rule: /[A-Z]/.test(form.password),          label: "Uppercase letter" },
                      { rule: /[a-z]/.test(form.password),          label: "Lowercase letter" },
                      { rule: /[^A-Za-z0-9]/.test(form.password),   label: "Special character" },
                    ].map(({ rule, label }) => (
                      <div key={label} style={{
                        display: "flex", alignItems: "center", gap: "6px",
                        fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                        fontSize: "9px", letterSpacing: "1px",
                        color: rule ? "var(--g)" : "var(--dim)", transition: "color 0.2s",
                      }}>
                        <span>{rule ? "✓" : "·"}</span><span>{label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ marginBottom: "16px", marginTop: "10px" }}>
                <label style={labelStyle}>Confirm Password <span style={{ color: "var(--red)" }}>*</span></label>
                <input type="password" placeholder="········" value={form.confirm}
                  onChange={set("confirm")} onFocus={() => setFocused("confirm")} onBlur={() => setFocused("")}
                  style={{ ...inputStyle("confirm"), letterSpacing: "2px" }} />
              </div>

              <button
                onClick={handleSignUp}
                disabled={loading}
                style={{ ...nextBtn, flex: "unset", width: "100%", opacity: loading ? 0.6 : 1 }}
                onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = "var(--g2)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--g)"; }}
              >
                {loading ? "Creating..." : "Continue →"}
              </button>
            </>
          )}

          {/* ── Step 2: profile details ── */}
          {step === 2 && (
            <>
              {/* Show username field only when it hasn't been set already */}
              {!hasUsername && (
                <div style={{ marginBottom: "10px" }}>
                  <label style={labelStyle}>Username <span style={{ color: "var(--red)" }}>*</span></label>
                  <input type="text" placeholder="your_handle" value={form.username}
                    onChange={set("username")} onFocus={() => setFocused("username")} onBlur={() => setFocused("")}
                    style={inputStyle("username")} />
                </div>
              )}

              <div style={{ marginBottom: "10px" }}>
                <label style={labelStyle}>Full Name <span style={{ color: "var(--red)" }}>*</span></label>
                <input type="text" placeholder="Your name" value={form.name}
                  onChange={set("name")} onFocus={() => setFocused("name")} onBlur={() => setFocused("")}
                  style={inputStyle("name")} />
              </div>

              <div style={{ marginBottom: "10px" }}>
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

              <div style={{ marginBottom: "16px" }}>
                <SearchableSelect
                  label="Favourite Club"
                  placeholder="Search clubs..."
                  options={CLUB_NAMES}
                  value={form.club}
                  onChange={setField("club")}
                  fieldKey="club"
                  focused={focused}
                  onFocus={setFocused}
                  onBlur={() => setFocused("")}
                  subtitleMap={CLUB_LEAGUE_MAP}
                />
              </div>

              <div style={{ display: "flex", gap: "12px" }}>
                {!isComplete && (
                  <button style={backBtn}
                    onClick={() => setStep(1)}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--dim)"; e.currentTarget.style.color = "var(--text)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = "var(--dim)"; }}
                  >← Back</button>
                )}
                <button
                  style={{ ...nextBtn, flex: isComplete ? "unset" : 2, width: isComplete ? "100%" : undefined }}
                  onClick={handleStep2Next}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--g2)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "var(--g)"; }}
                >Continue →</button>
              </div>
            </>
          )}

          {/* ── Step 3: review + submit ── */}
          {step === 3 && (
            <>
              <div style={{
                border: "1px solid var(--border2)", borderRadius: "2px",
                overflow: "hidden", marginBottom: "16px",
              }}>
                {[
                  { label: "Username",  value: form.username || "—" },
                  ...(!isComplete ? [{ label: "Email", value: form.email || "—" }] : []),
                  { label: "Full Name", value: form.name     || "—" },
                  { label: "Country",   value: form.country  || "—" },
                  { label: "Club",      value: form.club     || "—" },
                ].map(({ label, value }, i) => (
                  <div key={label} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "12px 16px",
                    borderTop: i === 0 ? "none" : "1px solid var(--border)",
                    background: i % 2 === 0 ? "var(--dark2)" : "var(--card)",
                  }}>
                    <span style={{
                      fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                      fontSize: "9px", color: "var(--dim)",
                      letterSpacing: "2px", textTransform: "uppercase",
                    }}>{label}</span>
                    <span style={{
                      fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                      fontSize: "12px", color: "var(--text)", letterSpacing: "1px",
                    }}>{value}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: "12px" }}>
                <button style={backBtn}
                  onClick={() => setStep(2)}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--dim)"; e.currentTarget.style.color = "var(--text)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = "var(--dim)"; }}
                >← Back</button>
                <button
                  onClick={handleCreateAccount}
                  disabled={loading}
                  onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = "var(--g2)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "var(--g)"; }}
                  style={{ ...nextBtn, opacity: loading ? 0.6 : 1 }}
                >{loading ? "Saving..." : "Create Account →"}</button>
              </div>
            </>
          )}
        </div>

        {/* Progress bar */}
        <div style={{ display: "flex", gap: "2px", padding: "10px 24px", borderTop: "1px solid var(--border)" }}>
          {(isComplete ? [2, 3] : [1, 2, 3]).map((s) => (
            <div key={s} style={{
              flex: 1, height: "3px", borderRadius: "2px",
              background: s <= step ? "var(--g)" : "var(--border2)",
              transition: "background 0.3s",
            }} />
          ))}
        </div>

      </div>
    </div>
  );
}
