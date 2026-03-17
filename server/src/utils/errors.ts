import type { Socket } from "socket.io";

export class AppError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function emitError(socket: Socket, code: string, message: string) {
  socket.emit("room:error", { code, message });
}
