import { io, Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@/types/socket";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

let socket: AppSocket | null = null;

export function connectSocket(token: string): AppSocket {
  if (socket?.connected) return socket;

  if (socket) {
    socket.auth = { token };
    socket.connect();
    return socket;
  }

  socket = io(SOCKET_URL, {
    auth: { token },
    autoConnect: true,
    transports: ["websocket", "polling"],
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  }) as AppSocket;

  return socket;
}

export function getSocket(): AppSocket | null {
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
