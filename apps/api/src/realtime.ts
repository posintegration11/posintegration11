import type { Server as IOServer } from "socket.io";

let io: IOServer | null = null;

export function setIoInstance(server: IOServer) {
  io = server;
}

export function getIo(): IOServer | null {
  return io;
}

/** Emit to all floor + kitchen clients for one restaurant. */
export function emitToTenant(restaurantId: string, event: string, payload?: unknown) {
  io?.to(`tenant:${restaurantId}:floor`).emit(event, payload);
  io?.to(`tenant:${restaurantId}:kitchen`).emit(event, payload);
}
