import { io, type Socket } from "socket.io-client";
import { getToken } from "./auth";

const url = () => process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4000";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const token = getToken();
    socket = io(url(), {
      auth: { token },
      autoConnect: false,
    });
  }
  return socket;
}

export function reconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
