import type { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { getEnv } from "../config/env.js";
import type { AuthPayload } from "../middleware/auth.js";

export function setupSocketIo(io: Server) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      return next(new Error("Unauthorized"));
    }
    try {
      const decoded = jwt.verify(token, getEnv().JWT_SECRET) as AuthPayload;
      socket.data.userId = decoded.sub;
      socket.data.role = decoded.role;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const role = socket.data.role as string;
    if (role === "KITCHEN" || role === "ADMIN") {
      void socket.join("kitchen");
    }
    if (role === "ADMIN" || role === "CASHIER" || role === "WAITER") {
      void socket.join("floor");
    }
  });
}
