export type Side = "a" | "b";

export type RoomStatus = "lobby" | "side_pick" | "live" | "voting" | "results";

export type PhaseName =
  | "opening_a"
  | "opening_b"
  | "rebuttal_a"
  | "rebuttal_b"
  | "closing_a"
  | "closing_b"
  | "voting";

export interface RoomMember {
  userId: string;
  username: string;
  avatarUrl: string | null;
  side: Side | null;
  isReady: boolean;
  joinedAt: number;
}

export interface UserBrief {
  userId: string;
  username: string;
  avatarUrl: string | null;
}

export interface PhaseState {
  name: PhaseName;
  speaker: Side | null;
  endsAt: number;
  index: number;
}

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  body: string;
  createdAt: string;
}

export interface FullRoomState {
  roomId: string;
  status: RoomStatus;
  topic: string;
  sideALabel: string;
  sideBLabel: string;
  members: RoomMember[];
  debaterA: UserBrief | null;
  debaterB: UserBrief | null;
  phase: PhaseState | null;
  chat: ChatMessage[];
  debateId: string | null;
  votes: { a: number; b: number } | null;
}

export interface ResultsData {
  winnerId: string | null;
  result: "side_a" | "side_b" | "draw";
  votesA: number;
  votesB: number;
  eloChange: number;
  debaterA: { id: string; username: string; newElo: number };
  debaterB: { id: string; username: string; newElo: number };
}

// Socket event maps
export interface ClientToServerEvents {
  "room:create": (data: { topic: string; sideALabel: string; sideBLabel: string }) => void;
  "room:join": (data: { roomId: string }) => void;
  "room:leave": () => void;
  "room:state": () => void;
  "side:pick": (data: { side: Side }) => void;
  "side:unpick": () => void;
  "side:ready": () => void;
  "chat:send": (data: { body: string }) => void;
  "vote:cast": (data: { side: Side }) => void;
}

export interface ServerToClientEvents {
  "room:joined": (data: { roomId: string; state: FullRoomState }) => void;
  "room:created": (data: { roomId: string }) => void;
  "room:error": (data: { code: string; message: string }) => void;
  "room:member_joined": (data: { userId: string; username: string; avatarUrl: string | null }) => void;
  "room:member_left": (data: { userId: string }) => void;
  "room:state_sync": (data: { state: FullRoomState }) => void;
  "room:closed": (data: { reason: string }) => void;
  "side:updated": (data: { sides: { a: UserBrief | null; b: UserBrief | null }; spectators: UserBrief[] }) => void;
  "side:ready_updated": (data: { userId: string; isReady: boolean }) => void;
  "debate:starting": (data: { debateId: string; countdown: number }) => void;
  "debate:phase_change": (data: { phase: PhaseName; speaker: Side | null; endsAt: number; index: number }) => void;
  "debate:ended": () => void;
  "vote:window_open": (data: { endsAt: number }) => void;
  "vote:window_closed": () => void;
  "vote:count_update": (data: { a: number; b: number; total: number }) => void;
  "results:final": (data: ResultsData) => void;
  "chat:message": (data: ChatMessage) => void;
  "topic:change": (data: { topic: string; sideALabel: string; sideBLabel: string }) => void;
}
