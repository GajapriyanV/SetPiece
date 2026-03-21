"use client";

import { useEffect, useReducer, useCallback, useRef } from "react";
import { useSocket } from "./useSocket";
import type {
  FullRoomState,
  FeaturedMetaBrief,
  RoomMember,
  Side,
  UserBrief,
  PhaseState,
  ChatMessage,
  ResultsData,
  PhaseName,
} from "@/types/socket";

// Extended state with UI-specific fields
interface RoomUIState extends FullRoomState {
  voteWindowEndsAt: number | null;
  results: ResultsData | null;
  countdown: number | null; // debate starting countdown
  myVote: Side | null;
  closingAt: number | null;
  sidePickEndsAt: number | null;
  skipVotes: { count: number; required: number; votedUserIds: string[] } | null;
  closed: boolean;
  closedReason: string | null;
  debateCancelled: { reason: string; username: string } | null;
  disconnectedDebater: { userId: string; username: string } | null;
}

type RoomAction =
  | { type: "SET_STATE"; state: FullRoomState }
  | { type: "MEMBER_JOINED"; userId: string; username: string; avatarUrl: string | null }
  | { type: "MEMBER_LEFT"; userId: string }
  | { type: "SIDES_UPDATED"; sides: { a: UserBrief | null; b: UserBrief | null }; spectators: UserBrief[] }
  | { type: "READY_UPDATED"; userId: string; isReady: boolean }
  | { type: "DEBATE_STARTING"; debateId: string; countdown: number }
  | { type: "PHASE_CHANGE"; phase: PhaseName; speaker: Side | null; endsAt: number; index: number }
  | { type: "DEBATE_ENDED" }
  | { type: "VOTE_WINDOW_OPEN"; endsAt: number }
  | { type: "VOTE_WINDOW_CLOSED" }
  | { type: "VOTE_COUNT_UPDATE"; a: number; b: number }
  | { type: "RESULTS_FINAL"; data: ResultsData }
  | { type: "CHAT_MESSAGE"; message: ChatMessage }
  | { type: "TOPIC_CHANGE"; topic: string; sideALabel: string; sideBLabel: string }
  | { type: "MY_VOTE"; side: Side }
  | { type: "COUNTDOWN_TICK"; value: number }
  | { type: "FEATURED_SIDE_PICK_STARTED"; sidePickEndsAt: number }
  | { type: "FEATURED_TOPIC_REVEAL"; topic: string; sideALabel: string; sideBLabel: string; topicIndex: number; debatesCompleted: number; sidePickEndsAt: number }
  | { type: "FEATURED_DEBATER_DISCONNECTED"; userId: string; username: string }
  | { type: "DEBATER_RECONNECTED"; userId: string; username: string }
  | { type: "FEATURED_DEBATE_CANCELLED"; reason: string; username: string }
  | { type: "FEATURED_TOPIC_SKIPPED" }
  | { type: "FEATURED_DEBATE_COMPLETE"; debatesCompleted: number; maxDebates: number }
  | { type: "ROOM_CLOSING"; reason: string; closingAt: number }
  | { type: "ROOM_CLOSED"; reason: string }
  | { type: "FEATURED_SKIP_VOTES"; count: number; required: number; votedUserIds: string[] };

const initialState: RoomUIState = {
  roomId: "",
  status: "lobby",
  topic: "",
  sideALabel: "",
  sideBLabel: "",
  members: [],
  debaterA: null,
  debaterB: null,
  phase: null,
  chat: [],
  debateId: null,
  votes: null,
  isFeatured: false,
  featuredMeta: null,
  voteWindowEndsAt: null,
  results: null,
  countdown: null,
  myVote: null,
  closingAt: null,
  sidePickEndsAt: null,
  skipVotes: null,
  closed: false,
  closedReason: null,
  debateCancelled: null,
  disconnectedDebater: null,
};

function roomReducer(state: RoomUIState, action: RoomAction): RoomUIState {
  switch (action.type) {
    case "SET_STATE":
      return { ...state, ...action.state, results: state.results, myVote: state.myVote };

    case "MEMBER_JOINED":
      if (state.members.find((m) => m.userId === action.userId)) return state;
      return {
        ...state,
        members: [
          ...state.members,
          { userId: action.userId, username: action.username, avatarUrl: action.avatarUrl, side: null, isReady: false, joinedAt: Date.now() },
        ],
      };

    case "MEMBER_LEFT": {
      const filtered = state.members.filter((m) => m.userId !== action.userId);
      return {
        ...state,
        members: filtered,
        // Clear debater references if the leaving user was a debater
        debaterA: state.debaterA?.userId === action.userId ? null : state.debaterA,
        debaterB: state.debaterB?.userId === action.userId ? null : state.debaterB,
      };
    }

    case "SIDES_UPDATED": {
      // Only update status if we're in lobby/side_pick — don't override live/voting/results
      const inLobbyOrPick = state.status === "lobby" || state.status === "side_pick";
      const newStatus = inLobbyOrPick
        ? ((action.sides.a || action.sides.b) ? "side_pick" : "lobby")
        : state.status;
      return {
        ...state,
        debaterA: action.sides.a,
        debaterB: action.sides.b,
        status: newStatus,
        members: state.members.map((m) => {
          if (action.sides.a?.userId === m.userId) return { ...m, side: "a" as Side };
          if (action.sides.b?.userId === m.userId) return { ...m, side: "b" as Side };
          return { ...m, side: null };
        }),
      };
    }

    case "READY_UPDATED":
      return {
        ...state,
        members: state.members.map((m) =>
          m.userId === action.userId ? { ...m, isReady: action.isReady } : m
        ),
      };

    case "DEBATE_STARTING":
      return { ...state, status: "live", debateId: action.debateId, countdown: action.countdown };

    case "COUNTDOWN_TICK":
      return { ...state, countdown: action.value };

    case "PHASE_CHANGE":
      return {
        ...state,
        status: "live",
        countdown: null,
        phase: { name: action.phase, speaker: action.speaker, endsAt: action.endsAt, index: action.index },
      };

    case "DEBATE_ENDED":
      return { ...state, phase: null };

    case "VOTE_WINDOW_OPEN":
      return { ...state, status: "voting", voteWindowEndsAt: action.endsAt, votes: { a: 0, b: 0 } };

    case "VOTE_WINDOW_CLOSED":
      return { ...state, voteWindowEndsAt: null };

    case "VOTE_COUNT_UPDATE":
      return { ...state, votes: { a: action.a, b: action.b } };

    case "RESULTS_FINAL":
      return { ...state, status: "results", results: action.data };

    case "CHAT_MESSAGE":
      return { ...state, chat: [...state.chat, action.message] };

    case "TOPIC_CHANGE":
      return {
        ...state,
        topic: action.topic,
        sideALabel: action.sideALabel,
        sideBLabel: action.sideBLabel,
        status: "lobby",
        debaterA: null,
        debaterB: null,
        phase: null,
        debateId: null,
        results: null,
        myVote: null,
        countdown: null,
        disconnectedDebater: null,
        debateCancelled: null,
        voteWindowEndsAt: null,
        votes: null,
        sidePickEndsAt: null,
        skipVotes: null,
        members: state.members.map((m) => ({ ...m, side: null, isReady: false })),
      };

    case "MY_VOTE":
      return { ...state, myVote: action.side };

    case "FEATURED_SIDE_PICK_STARTED":
      return { ...state, sidePickEndsAt: action.sidePickEndsAt };

    case "FEATURED_TOPIC_REVEAL":
      return {
        ...state,
        topic: action.topic,
        sideALabel: action.sideALabel,
        sideBLabel: action.sideBLabel,
        status: "lobby",
        debaterA: null,
        debaterB: null,
        phase: null,
        debateId: null,
        results: null,
        myVote: null,
        countdown: null,
        sidePickEndsAt: action.sidePickEndsAt,
        skipVotes: null,
        disconnectedDebater: null,
        members: state.members.map((m) => ({ ...m, side: null, isReady: false })),
        featuredMeta: state.featuredMeta
          ? { ...state.featuredMeta, currentTopicIndex: action.topicIndex, debatesCompleted: action.debatesCompleted }
          : state.featuredMeta,
      };

    case "FEATURED_DEBATER_DISCONNECTED":
      return { ...state, disconnectedDebater: { userId: action.userId, username: action.username } };

    case "DEBATER_RECONNECTED":
      return { ...state, disconnectedDebater: null };

    case "FEATURED_DEBATE_CANCELLED":
      return { ...state, debateCancelled: { reason: action.reason, username: action.username } };

    case "FEATURED_TOPIC_SKIPPED":
      return state; // Informational — topic reveal follows immediately

    case "FEATURED_DEBATE_COMPLETE":
      return {
        ...state,
        featuredMeta: state.featuredMeta
          ? { ...state.featuredMeta, debatesCompleted: action.debatesCompleted, maxDebates: action.maxDebates }
          : state.featuredMeta,
      };

    case "FEATURED_SKIP_VOTES":
      return {
        ...state,
        skipVotes: { count: action.count, required: action.required, votedUserIds: action.votedUserIds },
      };

    case "ROOM_CLOSED":
      return { ...state, closed: true, closedReason: action.reason };

    case "ROOM_CLOSING":
      return { ...state, closingAt: action.closingAt };

    default:
      return state;
  }
}

export function useRoom(roomId: string) {
  const { socket, isConnected, error: socketError } = useSocket();
  const [state, dispatch] = useReducer(roomReducer, initialState);
  const [isLoading, setIsLoading] = useReducerCompat(true);
  const [error, setError] = useReducerCompat<string | null>(null);
  const joinedRef = useRef(false);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!socket || !isConnected || joinedRef.current) return;

    joinedRef.current = true;

    // Register listeners before joining
    socket.on("room:joined", ({ state: roomState }) => {
      dispatch({ type: "SET_STATE", state: roomState });
      setIsLoading(false);
    });

    socket.on("room:state_sync", ({ state: roomState }) => {
      dispatch({ type: "SET_STATE", state: roomState });
      setIsLoading(false);
    });

    socket.on("room:error", ({ message }) => {
      setError(message);
      setIsLoading(false);
    });

    socket.on("room:member_joined", (data) => {
      dispatch({ type: "MEMBER_JOINED", ...data });
    });

    socket.on("room:member_left", ({ userId }) => {
      dispatch({ type: "MEMBER_LEFT", userId });
    });

    socket.on("side:updated", ({ sides, spectators }) => {
      dispatch({ type: "SIDES_UPDATED", sides, spectators });
    });

    socket.on("side:ready_updated", ({ userId, isReady }) => {
      dispatch({ type: "READY_UPDATED", userId, isReady });
    });

    socket.on("debate:starting", ({ debateId, countdown }) => {
      dispatch({ type: "DEBATE_STARTING", debateId, countdown });
      // Start local countdown
      let c = countdown;
      if (countdownRef.current) clearInterval(countdownRef.current);
      countdownRef.current = setInterval(() => {
        c -= 1;
        if (c <= 0) {
          clearInterval(countdownRef.current!);
          countdownRef.current = null;
        }
        dispatch({ type: "COUNTDOWN_TICK", value: Math.max(0, c) });
      }, 1000);
    });

    socket.on("debate:phase_change", (data) => {
      dispatch({ type: "PHASE_CHANGE", ...data });
    });

    socket.on("debate:ended", () => {
      dispatch({ type: "DEBATE_ENDED" });
    });

    socket.on("vote:window_open", ({ endsAt }) => {
      dispatch({ type: "VOTE_WINDOW_OPEN", endsAt });
    });

    socket.on("vote:window_closed", () => {
      dispatch({ type: "VOTE_WINDOW_CLOSED" });
    });

    socket.on("vote:count_update", ({ a, b }) => {
      dispatch({ type: "VOTE_COUNT_UPDATE", a, b });
    });

    socket.on("results:final", (data) => {
      dispatch({ type: "RESULTS_FINAL", data });
    });

    socket.on("chat:message", (message) => {
      dispatch({ type: "CHAT_MESSAGE", message });
    });

    socket.on("topic:change", (data) => {
      dispatch({ type: "TOPIC_CHANGE", ...data });
    });

    socket.on("featured:side_pick_started", (data) => {
      dispatch({ type: "FEATURED_SIDE_PICK_STARTED", ...data });
    });

    socket.on("featured:debater_disconnected", (data) => {
      dispatch({ type: "FEATURED_DEBATER_DISCONNECTED", ...data });
    });

    socket.on("featured:debate_cancelled", (data) => {
      dispatch({ type: "FEATURED_DEBATE_CANCELLED", ...data });
    });

    socket.on("debate:debater_disconnected", (data) => {
      dispatch({ type: "FEATURED_DEBATER_DISCONNECTED", ...data });
    });

    socket.on("debate:cancelled", (data) => {
      dispatch({ type: "FEATURED_DEBATE_CANCELLED", ...data });
    });

    socket.on("debate:debater_reconnected", (data) => {
      dispatch({ type: "DEBATER_RECONNECTED", ...data });
    });

    socket.on("featured:topic_reveal", (data) => {
      dispatch({ type: "FEATURED_TOPIC_REVEAL", ...data });
    });

    socket.on("featured:topic_skipped", () => {
      dispatch({ type: "FEATURED_TOPIC_SKIPPED" });
    });

    socket.on("featured:debate_complete", (data) => {
      dispatch({ type: "FEATURED_DEBATE_COMPLETE", ...data });
    });

    socket.on("featured:skip_votes", (data) => {
      dispatch({ type: "FEATURED_SKIP_VOTES", ...data });
    });

    socket.on("room:closed", ({ reason }) => {
      dispatch({ type: "ROOM_CLOSED", reason });
    });

    socket.on("room:closing", (data) => {
      dispatch({ type: "ROOM_CLOSING", ...data });
    });

    // Join the room
    socket.emit("room:join", { roomId });

    return () => {
      socket.emit("room:leave");
      socket.off("room:joined");
      socket.off("room:state_sync");
      socket.off("room:error");
      socket.off("room:member_joined");
      socket.off("room:member_left");
      socket.off("side:updated");
      socket.off("side:ready_updated");
      socket.off("debate:starting");
      socket.off("debate:phase_change");
      socket.off("debate:ended");
      socket.off("vote:window_open");
      socket.off("vote:window_closed");
      socket.off("vote:count_update");
      socket.off("results:final");
      socket.off("chat:message");
      socket.off("topic:change");
      socket.off("featured:side_pick_started");
      socket.off("featured:debater_disconnected");
      socket.off("featured:debate_cancelled");
      socket.off("debate:debater_disconnected");
      socket.off("debate:cancelled");
      socket.off("debate:debater_reconnected");
      socket.off("featured:topic_reveal");
      socket.off("featured:topic_skipped");
      socket.off("featured:debate_complete");
      socket.off("featured:skip_votes");
      socket.off("room:closed");
      socket.off("room:closing");
      if (countdownRef.current) clearInterval(countdownRef.current);
      joinedRef.current = false;
    };
  }, [socket, isConnected, roomId]);

  // Actions
  const pickSide = useCallback(
    (side: Side) => socket?.emit("side:pick", { side }),
    [socket]
  );

  const unpickSide = useCallback(
    () => socket?.emit("side:unpick"),
    [socket]
  );

  const setReady = useCallback(
    () => socket?.emit("side:ready"),
    [socket]
  );

  const castVote = useCallback(
    (side: Side) => {
      socket?.emit("vote:cast", { side });
      dispatch({ type: "MY_VOTE", side });
    },
    [socket]
  );

  const sendChat = useCallback(
    (body: string) => socket?.emit("chat:send", { body }),
    [socket]
  );

  const voteSkip = useCallback(
    () => socket?.emit("featured:vote_skip"),
    [socket]
  );

  const leaveRoom = useCallback(
    () => socket?.emit("room:leave"),
    [socket]
  );

  return {
    state,
    actions: { pickSide, unpickSide, setReady, castVote, sendChat, voteSkip, leaveRoom },
    isLoading: isLoading && !socketError,
    error: socketError || error,
  };
}

// Simple state helper using useReducer for compatibility
function useReducerCompat<T>(initial: T): [T, (v: T) => void] {
  const [state, dispatch] = useReducer((_: T, action: T) => action, initial);
  return [state, dispatch];
}
