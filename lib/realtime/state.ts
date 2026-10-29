import type { FullRoomState, ResultsData, Side, ChatMessage } from "@/types/socket";
export interface RoomUIState extends FullRoomState {
  revision?: number;
  countdownEndsAt?: number | null;
  connectionNotice?: string | null;
  actionError?: string | null;
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


export const initialState: RoomUIState = {
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



export type Snapshot = Omit<FullRoomState, "status" | "members"> & {
  status: FullRoomState["status"] | "countdown" | "awaiting_result" | "closing" | "closed";
  revision: number; serverTime: number; countdownEndsAt: number | null; votingEndsAt: number | null;
  sidePickEndsAt: number | null; closingAt: number | null; ownVote: Side | null; results: ResultsData | null;
  skipVotes: RoomUIState["skipVotes"];
  members: (FullRoomState["members"][number] & { departAt?: number | null })[];
};
export function snapshotState(snapshot: Snapshot, now = Date.now()): RoomUIState {
  const offset = snapshot.serverTime - now;
  const local = (time: number | null) => time === null ? null : time - offset;
  const countdownEndsAt = local(snapshot.countdownEndsAt);
  const status = snapshot.status === "countdown" ? "live"
    : snapshot.status === "awaiting_result" ? "voting"
    : snapshot.status === "closing" ? "results"
    : snapshot.status === "closed" ? "lobby" : snapshot.status;
  const disconnected = snapshot.members.find(m => m.departAt && (m.userId === snapshot.debaterA?.userId || m.userId === snapshot.debaterB?.userId));
  return {
    ...initialState, ...snapshot, status, revision: snapshot.revision,
    phase: snapshot.phase ? { ...snapshot.phase, endsAt: snapshot.phase.endsAt - offset } : null,
    voteWindowEndsAt: local(snapshot.votingEndsAt), results: snapshot.results, myVote: snapshot.ownVote,
    countdownEndsAt, countdown: countdownEndsAt === null ? null : Math.max(0, Math.ceil((countdownEndsAt - now) / 1000)),
    sidePickEndsAt: local(snapshot.sidePickEndsAt), closingAt: local(snapshot.closingAt),
    closed: snapshot.status === "closed", closedReason: snapshot.status === "closed" ? "Room closed" : null,
    disconnectedDebater: disconnected ? { userId: disconnected.userId, username: disconnected.username } : null,
    chat: uniqueChat(snapshot.chat), skipVotes: snapshot.skipVotes,
  };
}
export function uniqueChat(messages: ChatMessage[]) {
  return [...new Map(messages.map(message => [message.id, message])).values()].slice(-200);
}
