"use client";

import { useServerTimer } from "@/hooks/useServerTimer";
import { useLiveKit } from "@/hooks/useLiveKit";
import type { PhaseState, RoomMember, UserBrief } from "@/types/socket";

const PHASE_LABELS: Record<string, string> = {
  opening_a: "Opening Statement — Side A",
  opening_b: "Opening Statement — Side B",
  rebuttal_a: "Rebuttal — Side A",
  rebuttal_b: "Rebuttal — Side B",
  closing_a: "Closing Argument — Side A",
  closing_b: "Closing Argument — Side B",
};

const PHASE_COUNT = 6;

function WaveformBars() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "3px", height: "24px" }}>
      {[0.6, 1, 0.7, 1, 0.5, 0.9, 0.6, 1, 0.75].map((h, i) => (
        <div
          key={i}
          style={{
            width: "3px",
            height: `${h * 100}%`,
            background: "var(--g)",
            borderRadius: "2px",
            animation: `wv 0.${5 + (i % 4)}s ease-in-out infinite alternate`,
            animationDelay: `${i * 0.08}s`,
          }}
        />
      ))}
    </div>
  );
}

function InactiveDots() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            width: "5px",
            height: "5px",
            borderRadius: "50%",
            background: "var(--border2)",
          }}
        />
      ))}
    </div>
  );
}

function DebaterCard({
  name,
  stance,
  avatar,
  avatarUrl,
  avatarColor,
  active,
  speaking,
  disconnected,
}: {
  name: string;
  stance: string;
  avatar: string;
  avatarUrl?: string | null;
  avatarColor: string;
  active: boolean;
  speaking: boolean;
  disconnected: boolean;
}) {
  return (
    <div
      style={{
        background: disconnected
          ? "rgba(245,158,11,0.06)"
          : active
          ? "rgba(0,255,135,0.04)"
          : "var(--card)",
        border: `1px solid ${disconnected ? "#f59e0b" : active ? "var(--g)" : "var(--border)"}`,
        borderRadius: "4px",
        padding: "32px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "12px",
        transition: "border-color 0.3s",
        opacity: disconnected ? 0.7 : 1,
      }}
    >
      <div
        style={{
          width: "56px",
          height: "56px",
          borderRadius: "50%",
          background: disconnected ? "#f59e0b" : avatarColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
          fontSize: "22px",
          fontWeight: 700,
          color: "#fff",
          transition: "background 0.3s",
          overflow: "hidden",
        }}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          avatar
        )}
      </div>

      <div
        style={{
          fontFamily: "var(--font-body, 'Familjen Grotesk', sans-serif)",
          fontSize: "15px",
          fontWeight: 600,
          color: disconnected ? "#f59e0b" : "var(--text)",
          textAlign: "center",
        }}
      >
        {name}
      </div>

      {disconnected ? (
        <div
          style={{
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "9px",
            letterSpacing: "2px",
            textTransform: "uppercase",
            color: "#f59e0b",
          }}
        >
          Reconnecting...
        </div>
      ) : (
        <div
          style={{
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "9px",
            letterSpacing: "2px",
            textTransform: "uppercase",
            color: active ? "var(--g)" : "var(--dim)",
          }}
        >
          For {stance}
        </div>
      )}

      <div style={{ height: "24px", display: "flex", alignItems: "center" }}>
        {disconnected ? null : speaking ? <WaveformBars /> : <InactiveDots />}
      </div>
    </div>
  );
}

export default function LiveView({
  phase,
  debaterA,
  debaterB,
  sideALabel,
  sideBLabel,
  members,
  countdown,
  roomId,
  currentUserId,
  disconnectedDebater,
}: {
  phase: PhaseState | null;
  debaterA: UserBrief | null;
  debaterB: UserBrief | null;
  sideALabel: string;
  sideBLabel: string;
  members: RoomMember[];
  countdown: number | null;
  roomId: string;
  currentUserId: string | null;
  disconnectedDebater?: { userId: string; username: string } | null;
}) {
  const secondsLeft = useServerTimer(phase?.endsAt ?? null);
  const { isSpeaking, canPublish, micEnabled, isReconnecting, needsAudioUnlock, toggleMic, unlockAudio } = useLiveKit(roomId);

  // If we're in the starting countdown
  if (countdown !== null && countdown > 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "80px 40px" }}>
        <div
          style={{
            fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
            fontSize: "10px",
            letterSpacing: "3px",
            textTransform: "uppercase",
            color: "var(--g)",
            marginBottom: "24px",
          }}
        >
          Debate Starting In
        </div>
        <div
          style={{
            fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)",
            fontSize: "clamp(80px, 15vw, 160px)",
            fontWeight: 900,
            lineHeight: 0.9,
            color: "var(--g)",
          }}
        >
          {countdown}
        </div>
      </div>
    );
  }

  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, "0");

  const phaseIndex = phase?.index ?? 0;
  const phaseTotal = phase ? (phase.endsAt - Date.now() + secondsLeft * 1000) : 1;
  // Rough progress within current phase segment
  const phasePct = phase
    ? Math.max(0, Math.min(100, 100 - (secondsLeft / getPhaseTotal(phase.name)) * 100))
    : 0;

  const activeSide = phase?.speaker;

  const spectators = members.filter(
    (m) => m.userId !== debaterA?.userId && m.userId !== debaterB?.userId
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "36px 40px 0" }}>

      {/* Reconnecting banner */}
      {isReconnecting && (
        <div style={{
          width: "100%", maxWidth: "600px", marginBottom: "20px",
          padding: "12px 20px",
          background: "rgba(255,45,85,0.08)",
          border: "1px solid var(--red)",
          borderRadius: "4px",
          display: "flex", alignItems: "center", gap: "10px",
        }}>
          <div className="status-dot-live" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--red)", flexShrink: 0 }} />
          <span style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--red)" }}>
            Reconnecting...
          </span>
        </div>
      )}

      {/* Audio unlock banner — shown when browser blocks autoplay */}
      {needsAudioUnlock && (
        <button
          onClick={unlockAudio}
          style={{
            width: "100%", maxWidth: "600px", marginBottom: "20px",
            padding: "12px 20px",
            background: "rgba(0,255,135,0.08)",
            border: "1px solid var(--g)",
            borderRadius: "4px",
            display: "flex", alignItems: "center", gap: "10px",
            cursor: "pointer",
          }}
        >
          <div className="status-dot-live" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--g)", flexShrink: 0 }} />
          <span style={{ fontFamily: "var(--font-mono, 'Roboto Mono', monospace)", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--g)" }}>
            Click to enable audio
          </span>
        </button>
      )}

      {/* Phase label */}
      <div
        style={{
          fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
          fontSize: "10px",
          letterSpacing: "3px",
          textTransform: "uppercase",
          color: "var(--g)",
          marginBottom: "16px",
        }}
      >
        {phase ? PHASE_LABELS[phase.name] || phase.name : ""}
      </div>

      {/* Segmented progress bar */}
      <div style={{ width: "100%", maxWidth: "600px", marginBottom: "24px", position: "relative" }}>
        <div style={{ display: "flex", gap: "4px" }}>
          {Array.from({ length: PHASE_COUNT }).map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: "3px",
                background: "var(--border2)",
                borderRadius: "2px",
                overflow: "hidden",
                position: "relative",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "var(--g)",
                  transformOrigin: "left",
                  transform:
                    i < phaseIndex
                      ? "scaleX(1)"
                      : i === phaseIndex
                      ? `scaleX(${phasePct / 100})`
                      : "scaleX(0)",
                  transition: "transform 1s linear",
                }}
              />
            </div>
          ))}
        </div>
        {/* Moving dot */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: `calc(${(phaseIndex / PHASE_COUNT) * 100 + (phasePct / 100) * (100 / PHASE_COUNT)}% - 6px)`,
            transform: "translateY(-50%)",
            width: "12px",
            height: "12px",
            borderRadius: "50%",
            border: "2px solid var(--g)",
            background: "var(--dark)",
            boxShadow: "0 0 8px var(--g)",
            transition: "left 1s linear",
          }}
        />
      </div>

      {/* Timer */}
      <div
        style={{
          fontFamily: "var(--font-display, 'Big Shoulders Display', sans-serif)",
          fontSize: "clamp(64px, 10vw, 108px)",
          fontWeight: 900,
          lineHeight: 0.9,
          letterSpacing: "-4px",
          color: "var(--text)",
          marginBottom: "28px",
        }}
      >
        {mm > 0 ? `${mm}:${ss}` : `0:${ss}`}
      </div>

      {/* Debater cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "stretch",
          width: "100%",
          maxWidth: "600px",
        }}
      >
        <DebaterCard
          name={debaterA?.username ?? "—"}
          stance={sideALabel}
          avatar={(debaterA?.username ?? "?")[0].toUpperCase()}
          avatarUrl={debaterA?.avatarUrl}
          avatarColor="#3b82f6"
          active={activeSide === "a"}
          speaking={activeSide === "a" && debaterA ? !!isSpeaking[debaterA.userId] : false}
          disconnected={!!disconnectedDebater && disconnectedDebater.userId === debaterA?.userId}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "0 20px",
            fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
            fontSize: "16px",
            fontWeight: 700,
            color: "var(--dim)",
            letterSpacing: "3px",
          }}
        >
          VS
        </div>
        <DebaterCard
          name={debaterB?.username ?? "—"}
          stance={sideBLabel}
          avatar={(debaterB?.username ?? "?")[0].toUpperCase()}
          avatarUrl={debaterB?.avatarUrl}
          avatarColor="#fb923c"
          active={activeSide === "b"}
          speaking={activeSide === "b" && debaterB ? !!isSpeaking[debaterB.userId] : false}
          disconnected={!!disconnectedDebater && disconnectedDebater.userId === debaterB?.userId}
        />
      </div>

      {/* Mic toggle — only shown to debaters when it's their turn */}
      {canPublish && (
        <div style={{ marginTop: "20px" }}>
          <button
            onClick={toggleMic}
            style={{
              display: "flex", alignItems: "center", gap: "10px",
              padding: "12px 24px",
              background: micEnabled ? "rgba(0,255,135,0.1)" : "var(--card)",
              border: `1px solid ${micEnabled ? "var(--g)" : "var(--border2)"}`,
              borderRadius: "4px",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            <div style={{
              width: "8px", height: "8px", borderRadius: "50%",
              background: micEnabled ? "var(--g)" : "var(--dim)",
              animation: micEnabled ? "blink 1s infinite" : "none",
            }} />
            <span style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase",
              color: micEnabled ? "var(--g)" : "var(--dim)",
            }}>
              {micEnabled ? "Mic On — Click to Mute" : "Click to Speak"}
            </span>
          </button>
        </div>
      )}

      {/* Audience section */}
      <div style={{ width: "100%", maxWidth: "600px", marginTop: "32px", paddingBottom: "48px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
          <div
            className="status-dot-live"
            style={{ width: "5px", height: "5px", borderRadius: "50%", background: "var(--g)", flexShrink: 0 }}
          />
          <span
            style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "9px",
              letterSpacing: "2.5px",
              textTransform: "uppercase",
              color: "var(--dim)",
            }}
          >
            Audience
          </span>
          <span
            style={{
              fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
              fontSize: "13px",
              fontWeight: 700,
              color: "var(--dim)",
              marginLeft: "4px",
            }}
          >
            {spectators.length}
          </span>
        </div>

        <div className="r-audience-grid" style={{ gap: "20px 12px" }}>
          {spectators.slice(0, 11).map((s) => (
            <div key={s.userId} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  background: stringToColor(s.username),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "#fff",
                  border: "2px solid var(--border2)",
                }}
              >
                {s.username[0]?.toUpperCase() ?? "?"}
              </div>
              <span
                style={{
                  fontFamily: "var(--font-body, 'Familjen Grotesk', sans-serif)",
                  fontSize: "10px",
                  color: "var(--dim)",
                  textAlign: "center",
                  lineHeight: 1.2,
                  wordBreak: "break-word",
                }}
              >
                {s.username}
              </span>
            </div>
          ))}

          {spectators.length > 11 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  background: "var(--card)",
                  border: "1px dashed var(--border2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
                  fontSize: "9px",
                  color: "var(--dim)",
                }}
              >
                +{spectators.length - 11}
              </div>
              <span
                style={{
                  fontFamily: "var(--font-body, 'Familjen Grotesk', sans-serif)",
                  fontSize: "10px",
                  color: "var(--dim)",
                  textAlign: "center",
                }}
              >
                more
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getPhaseTotal(name: string): number {
  if (name.startsWith("opening")) return 150;
  if (name.startsWith("rebuttal")) return 60;
  if (name.startsWith("closing")) return 30;
  return 60;
}

function stringToColor(str: string): string {
  const colors = ["#8b5cf6", "#06b6d4", "#f59e0b", "#ec4899", "#10b981", "#3b82f6", "#f97316", "#6366f1"];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}
