import type { Server as IOServer } from "socket.io";

let io: IOServer | null = null;

export function setIoInstance(server: IOServer) {
  io = server;
}

export function getIo(): IOServer | null {
  return io;
}

export function emitFloor(event: string, payload?: unknown) {
  io?.to("floor").emit(event, payload);
}

export function emitKitchen(event: string, payload?: unknown) {
  io?.to("kitchen").emit(event, payload);
}

export function emitAll(event: string, payload?: unknown) {
  io?.to("floor").emit(event, payload);
  io?.to("kitchen").emit(event, payload);
}
