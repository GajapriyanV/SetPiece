export const goRoomsEnabled = process.env.NEXT_PUBLIC_ROOM_BACKEND === "go";
export const goHTTPURL = process.env.NEXT_PUBLIC_GO_HTTP_URL || "http://127.0.0.1:3002";
export const goWSURL = process.env.NEXT_PUBLIC_GO_WS_URL || goHTTPURL.replace(/\/$/, "").replace(/^http/, "ws") + "/api/realtime/ws";
export const legacyHTTPURL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";
export function roomTarget(routeId: string) {
  return routeId.startsWith("g2-")
    ? { backend: "go" as const, id: routeId.slice(3), baseURL: goHTTPURL }
    : { backend: "legacy" as const, id: routeId, baseURL: legacyHTTPURL };
}
export function roomPath(id: string, backend: "go" | "legacy" = goRoomsEnabled ? "go" : "legacy") {
  return "/rooms/" + (backend === "go" ? "g2-" : "") + id;
}
export type Listing = {
  roomId: string; topic: string; sideALabel: string; sideBLabel: string;
  status: "lobby" | "side_pick" | "live" | "voting" | "results";
  memberCount: number; isFeatured: boolean; debatesCompleted?: number; maxDebates?: number;
};
export async function listRooms(signal?: AbortSignal): Promise<Listing[]> {
  if (!goRoomsEnabled) {
    const response = await fetch(legacyHTTPURL + "/api/rooms", { signal });
    if (!response.ok) throw new Error("Rooms unavailable");
    return response.json();
  }
  const out: Listing[] = [];
  let cursor = "";
  for (let page = 0; page < 10; page++) {
    const response = await fetch(goHTTPURL + "/api/rooms?limit=100&after=" + encodeURIComponent(cursor), { signal, cache: "no-store" });
    if (!response.ok) throw new Error("Rooms unavailable");
    const data = await response.json();
    out.push(...data.rooms.map((room: Listing) => ({ ...room, roomId: "g2-" + room.roomId })));
    if (!data.nextCursor) return out;
    if (data.nextCursor === cursor) throw new Error("Invalid room pagination");
    cursor = data.nextCursor;
  }
  throw new Error("Too many rooms; narrow the listing");
}

export async function createRoom(token: string, topics: { topic: string; sideALabel: string; sideBLabel: string }[], featured: boolean) {
  const response = await fetch(new URL("/api/rooms", goHTTPURL), {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ topics, isFeatured: featured }), signal: AbortSignal.timeout(10000),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Room creation failed");
  return roomPath(body.roomId, "go");
}
