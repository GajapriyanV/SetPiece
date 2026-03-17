"use client";

import { useEffect, useReducer, useCallback, useRef } from "react";
import { useSocket } from "./useSocket";
import type {
  FullRoomState,
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
  | { type: "COUNTDOWN_TICK"; value: number };

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
  voteWindowEndsAt: null,
  results: null,
  countdown: null,
  myVote: null,
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

    case "MEMBER_LEFT":
      return { ...state, members: state.members.filter((m) => m.userId !== action.userId) };

    case "SIDES_UPDATED":
      return {
        ...state,
        debaterA: action.sides.a,
        debaterB: action.sides.b,
        status: (action.sides.a || action.sides.b) ? "side_pick" : "lobby",
        members: state.members.map((m) => {
          if (action.sides.a?.userId === m.userId) return { ...m, side: "a" as Side };
          if (action.sides.b?.userId === m.userId) return { ...m, side: "b" as Side };
          return { ...m, side: null };
        }),
      };

    case "READY_UPDATED":
      return {
        ...state,
        members: state.members.map((m) =>
          m.userId === action.userId ? { ...m, isReady: action.isReady } : m
        ),
      };

    case "DEBATE_STARTING":
      return { ...state, debateId: action.debateId, countdown: action.countdown };

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
        members: state.members.map((m) => ({ ...m, side: null, isReady: false })),
      };

    case "MY_VOTE":
      return { ...state, myVote: action.side };

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

  const leaveRoom = useCallback(
    () => socket?.emit("room:leave"),
    [socket]
  );

  return {
    state,
    actions: { pickSide, unpickSide, setReady, castVote, sendChat, leaveRoom },
    isLoading: isLoading && !socketError,
    error: socketError || error,
  };
}

// Simple state helper using useReducer for compatibility
function useReducerCompat<T>(initial: T): [T, (v: T) => void] {
  const [state, dispatch] = useReducer((_: T, action: T) => action, initial);
  return [state, dispatch];
}
