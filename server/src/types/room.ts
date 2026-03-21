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

export interface RoomState {
  status: RoomStatus;
  topic: string;
  sideALabel: string;
  sideBLabel: string;
  debaterAId: string | null;
  debaterBId: string | null;
  debateId: string | null;
  createdAt: number;
  isFeatured: boolean;
}

export interface FeaturedRoomMeta {
  topicQueue: { topic: string; sideALabel: string; sideBLabel: string }[];
  currentTopicIndex: number;
  debatesCompleted: number;
  maxDebates: number;
  lastActivityAt: number;
  closingAt: number | null;
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

export interface UserBrief {
  userId: string;
  username: string;
  avatarUrl: string | null;
}

export interface FeaturedMetaBrief {
  currentTopicIndex: number;
  debatesCompleted: number;
  maxDebates: number;
  topicCount: number;
  closingAt: number | null;
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
  isFeatured: boolean;
  featuredMeta: FeaturedMetaBrief | null;
}
