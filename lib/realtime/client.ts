// Standard WebSocket transport for explicitly routed Go rooms.
export type Event = {
  v: 1; type: string; requestId?: string; roomId?: string;
  revision?: number; sequence: number; data: Record<string, unknown> | null;
};
export type TransportOptions = {
  baseURL: string;
  websocketURL?: string;
  // Must obtain the current Supabase session on EVERY attempt. Return null on sign-out.
  getAccessToken: () => Promise<string | null>;
  onEvent: (event: Event) => void;
  onStatus?: (status: "connecting" | "connected" | "disconnected" | "signed_out") => void;
};
type Pending = { resolve: (data: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };
export class RoomTransport {
  private socket: WebSocket | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private active = false;
  private attempts = 0;
  private room: string | null = null;
  private revision = 0;
  private sequence = 0;
  private syncing = false;
  private pending = new Map<string, Pending>();
  private abort: AbortController | null = null;
  constructor(private options: TransportOptions) {
    const url = new URL(options.baseURL);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error("Invalid realtime base URL");
    }
  }
  start() {
    if (this.active) return;
    this.active = true;
    void this.connect(++this.generation);
  }
  // Bind this to Supabase SIGNED_OUT in phase 3B; it also cancels an in-flight ticket.
  signOut() {
    this.stop();
    this.room = null;
    this.options.onStatus?.("signed_out");
  }
  stop() {
    this.active = false;
    ++this.generation;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    this.abort?.abort();
    this.abort = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.rejectPending("Connection closed; refresh state before retrying");
  }
  async join(roomId: string) {
    if (!/^[a-f0-9]{8}$/.test(roomId)) throw new Error("Invalid room");
    // Remember desired membership across temporary loss. No mutations are queued.
    this.room = roomId;
    this.revision = 0;
    if (this.socket?.readyState === WebSocket.OPEN) {
      await this.send("room:join", { roomId });
    }
  }
  async leave() {
    this.room = null;
    this.revision = 0;
    // A temporary disconnect must never enqueue a later explicit leave.
    if (this.socket?.readyState === WebSocket.OPEN) await this.send("room:leave", {});
  }
  send(type: string, data: Record<string, unknown>, requestId = crypto.randomUUID()): Promise<unknown> {
    const socket = this.socket;
    if (socket?.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Not connected"));
    if (this.pending.size >= 64 || this.pending.has(requestId)) return Promise.reject(new Error("Too many pending commands or duplicate request ID"));
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(requestId)) return Promise.reject(new Error("Invalid request ID"));
    const serialized = JSON.stringify({ v: 1, type, requestId, data });
    if (new TextEncoder().encode(serialized).length > 16 * 1024) return Promise.reject(new Error("Command too large"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("Command acknowledgement timed out; refresh before retrying"));
      }, 10_000);
      this.pending.set(requestId, { resolve, reject, timer });
      try { socket.send(serialized); } catch {
        clearTimeout(timer); this.pending.delete(requestId); reject(new Error("Send failed"));
      }
    });
  }
  private rejectPending(message: string) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer); pending.reject(new Error(message));
    }
    this.pending.clear();
  }
  private schedule(generation: number) {
    if (!this.active || generation !== this.generation || this.retry) return;
    this.options.onStatus?.("disconnected");
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.attempts++, 5)) * (0.5 + Math.random() * 0.5);
    this.retry = setTimeout(() => { this.retry = null; void this.connect(generation); }, delay);
  }
  private async connect(generation: number) {
    if (!this.active || generation !== this.generation) return;
    this.options.onStatus?.("connecting");
    const controller = new AbortController();
    this.abort = controller;
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const token = await this.options.getAccessToken();
      if (!this.active || generation !== this.generation) return;
      if (!token) { this.signOut(); return; }
      const response = await fetch(new URL("/api/realtime/ticket", this.options.baseURL), {
        method: "POST", headers: { Authorization: "Bearer " + token }, cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Ticket unavailable");
      const body = await response.json();
      if (!this.active || generation !== this.generation) return;
      if (body.protocolVersion !== 1 || typeof body.ticket !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(body.ticket)) throw new Error("Invalid ticket");
      const url = this.options.websocketURL ? new URL(this.options.websocketURL) : new URL("/api/realtime/ws", this.options.baseURL);
      if (url.protocol === "https:") url.protocol = "wss:";
      if (url.protocol === "http:") url.protocol = "ws:";
      if (!["ws:", "wss:"].includes(url.protocol) || url.username || url.password) throw new Error("Invalid WebSocket URL");
      url.searchParams.set("ticket", body.ticket);
      const socket = new WebSocket(url);
      this.socket = socket;
      const handshake = setTimeout(() => socket.close(), 10_000);
      socket.onopen = () => {
        clearTimeout(handshake);
        if (!this.active || generation !== this.generation) { socket.close(); return; }
        this.sequence = 0; this.revision = 0; this.syncing = false;
        this.options.onStatus?.("connected");
        if (this.room) void this.send("room:join", { roomId: this.room }).catch(() => socket.close());
      };
      socket.onmessage = ({ data }) => {
        if (this.socket !== socket || generation !== this.generation) return;
        try { this.receive(JSON.parse(data)); } catch { socket.close(); }
      };
      socket.onerror = () => socket.close();
      socket.onclose = () => {
        clearTimeout(handshake);
        if (this.socket !== socket) return;
        this.socket = null;
        this.rejectPending("Connection lost; command outcome may need reconciliation");
        this.schedule(generation);
      };
    } catch {
      this.schedule(generation);
    } finally {
      clearTimeout(timeout);
      if (this.abort === controller) this.abort = null;
    }
  }
  private receive(event: Event) {
    if (event.v !== 1 || typeof event.type !== "string" || !Number.isSafeInteger(event.sequence) || event.sequence <= this.sequence) {
      throw new Error("Invalid server envelope");
    }
    const gap = this.sequence > 0 && event.sequence !== this.sequence + 1;
    this.sequence = event.sequence;
    this.attempts = 0;
    if (event.requestId) {
      const pending = this.pending.get(event.requestId);
      if (pending && (event.type === "ack" || event.type === "room:error")) {
        clearTimeout(pending.timer); this.pending.delete(event.requestId);
        if (event.type === "ack") pending.resolve(event.data);
        else pending.reject(new Error(String(event.data?.message ?? "Command rejected")));
      }
    }
    if (event.roomId && event.roomId !== this.room) return;
    const snapshot = event.type === "room:state_sync" || event.type === "room:joined";
    if (event.revision !== undefined) {
      if (event.revision < this.revision) return;
      if (!snapshot && (gap || (this.revision > 0 && event.revision > this.revision + 1))) {
        this.resync();
        return;
      }
      if (snapshot) { this.revision = event.revision; this.syncing = false; }
      // Deltas in a revision arrive before its snapshot; don't advance the
      // authoritative revision from partial events.
    } else if (gap) { this.resync(); }
    this.options.onEvent(event);
  }
  private resync() {
    if (this.syncing || !this.room) return;
    this.syncing = true;
    void this.send("room:state", {}).catch(() => { this.syncing = false; this.socket?.close(); });
  }
}
