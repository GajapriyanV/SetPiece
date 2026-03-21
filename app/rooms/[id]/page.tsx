"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useRoom } from "@/hooks/useRoom";
import RoomTopBar from "@/components/room/RoomTopBar";
import ChatPanel from "@/components/room/ChatPanel";
import LobbyView from "@/components/room/LobbyView";
import LiveView from "@/components/room/LiveView";
import VotingView from "@/components/room/VotingView";
import ResultsView from "@/components/room/ResultsView";

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;
  const { state, actions, isLoading, error } = useRoom(roomId);
  const [currentUserId, setCurrentUserId] = useState<string>("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
  }, []);

  // Handle room closed (error or server-sent close)
  useEffect(() => {
    if (error === "Room not found" || error === "Room is full" || state.closed) {
      const timeout = setTimeout(() => router.push("/rooms"), 2000);
      return () => clearTimeout(timeout);
    }
  }, [error, state.closed, router]);

  // Debate cancelled notice — auto-dismiss after 5s
  const [cancelNotice, setCancelNotice] = useState<{ reason: string; username: string } | null>(null);
  useEffect(() => {
    if (!state.debateCancelled) return;
    setCancelNotice(state.debateCancelled);
    const timeout = setTimeout(() => setCancelNotice(null), 5000);
    return () => clearTimeout(timeout);
  }, [state.debateCancelled]);

  // Closing countdown for featured rooms
  const [closingRemaining, setClosingRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (!state.closingAt) { setClosingRemaining(null); return; }
    function tick() {
      const left = Math.max(0, Math.ceil((state.closingAt! - Date.now()) / 1000));
      setClosingRemaining(left);
      if (left <= 0) {
        router.push("/rooms");
      }
    }
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [state.closingAt, router]);

  if (isLoading) {
    return (
      <main style={{ background: "var(--dark)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "24px",
              height: "24px",
              border: "2px solid var(--border)",
              borderTopColor: "var(--g)",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "10px",
              letterSpacing: "3px",
              textTransform: "uppercase",
              color: "var(--dim)",
            }}
          >
            Connecting to room...
          </span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </main>
    );
  }

  if (state.closed) {
    return (
      <main style={{ background: "var(--dark)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
          <span
            style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "11px",
              letterSpacing: "2px",
              textTransform: "uppercase",
              color: "var(--red)",
            }}
          >
            {state.closedReason || "Room closed"}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "10px",
              color: "var(--dim)",
            }}
          >
            Redirecting...
          </span>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main style={{ background: "var(--dark)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
          <span
            style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "11px",
              letterSpacing: "2px",
              textTransform: "uppercase",
              color: "var(--red)",
            }}
          >
            {error}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "10px",
              color: "var(--dim)",
            }}
          >
            Redirecting...
          </span>
        </div>
      </main>
    );
  }

  function handleLeave() {
    actions.leaveRoom();
    router.push("/rooms");
  }

  return (
    <main style={{ background: "var(--dark)", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <RoomTopBar
        status={state.status}
        memberCount={state.members.length}
        onLeave={handleLeave}
        isFeatured={state.isFeatured}
        featuredMeta={state.featuredMeta}
      />

      {/* Debate cancelled notice */}
      {cancelNotice && (
        <div
          style={{
            background: "rgba(255,45,85,0.08)",
            borderBottom: "1px solid rgba(255,45,85,0.3)",
            padding: "14px 32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "11px",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              color: "var(--red)",
              fontWeight: 600,
            }}
          >
            Debate cancelled
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "11px",
              letterSpacing: "1px",
              color: "var(--dim)",
            }}
          >
            — {cancelNotice.username} {cancelNotice.reason}
          </span>
        </div>
      )}

      {/* Closing countdown overlay */}
      {closingRemaining != null && closingRemaining > 0 && (
        <div
          style={{
            background: "rgba(255,45,85,0.08)",
            borderBottom: "1px solid rgba(255,45,85,0.3)",
            padding: "12px 32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono, 'Roboto Mono', monospace)",
              fontSize: "11px",
              letterSpacing: "2px",
              textTransform: "uppercase",
              color: "var(--red)",
            }}
          >
            Room closing in {closingRemaining}s
          </span>
        </div>
      )}

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Main content */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {/* Topic banner */}
          {(state.status === "live" || state.status === "voting") && (
            <div
              style={{
                textAlign: "center",
                padding: "16px 40px",
                borderBottom: "1px solid var(--border)",
                background: "var(--dark2)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-oswald, 'Oswald', sans-serif)",
                  fontSize: "clamp(16px, 2vw, 22px)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  color: "var(--text)",
                }}
              >
                {state.topic}
              </div>
            </div>
          )}

          {(state.status === "lobby" || state.status === "side_pick") && (
            <LobbyView
              topic={state.topic}
              sideALabel={state.sideALabel}
              sideBLabel={state.sideBLabel}
              members={state.members}
              debaterA={state.debaterA}
              debaterB={state.debaterB}
              currentUserId={currentUserId}
              onPickSide={actions.pickSide}
              onUnpickSide={actions.unpickSide}
              onReady={actions.setReady}
              onVoteSkip={actions.voteSkip}
              isFeatured={state.isFeatured}
              featuredMeta={state.featuredMeta}
              sidePickEndsAt={state.sidePickEndsAt}
              skipVotes={state.skipVotes}
            />
          )}

          {state.status === "live" && (
            <LiveView
              phase={state.phase}
              debaterA={state.debaterA}
              debaterB={state.debaterB}
              sideALabel={state.sideALabel}
              sideBLabel={state.sideBLabel}
              members={state.members}
              countdown={state.countdown}
              roomId={roomId}
              currentUserId={currentUserId || null}
              disconnectedDebater={state.disconnectedDebater}
            />
          )}

          {state.status === "voting" && (
            <VotingView
              sideALabel={state.sideALabel}
              sideBLabel={state.sideBLabel}
              votes={state.votes}
              voteWindowEndsAt={state.voteWindowEndsAt}
              myVote={state.myVote}
              onVote={actions.castVote}
            />
          )}

          {state.status === "results" && state.results && (
            <ResultsView
              results={state.results}
              sideALabel={state.sideALabel}
              sideBLabel={state.sideBLabel}
              isFeatured={state.isFeatured}
              featuredMeta={state.featuredMeta}
            />
          )}
        </div>

        {/* Chat panel */}
        <div style={{ width: "320px", flexShrink: 0, height: "calc(100vh - 52px)" }}>
          <ChatPanel messages={state.chat} onSend={actions.sendChat} />
        </div>
      </div>
    </main>
  );
}
