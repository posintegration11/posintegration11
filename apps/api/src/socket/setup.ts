import type { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { UserRole, UserStatus } from "@prisma/client";
import { getEnv } from "../config/env.js";
import { prisma } from "../prisma.js";

export function setupSocketIo(io: Server) {
  io.use((socket, next) => {
    void (async () => {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) {
        return next(new Error("Unauthorized"));
      }
      try {
        const env = getEnv();
        const decoded = jwt.verify(token, env.JWT_SECRET) as { sub: string };
        const u = await prisma.user.findUnique({
          where: { id: decoded.sub },
          select: { id: true, role: true, status: true, restaurantId: true },
        });
        if (!u || u.status !== UserStatus.ACTIVE || !u.restaurantId || u.role === UserRole.SUPER_ADMIN) {
          return next(new Error("Unauthorized"));
        }
        socket.data.userId = u.id;
        socket.data.role = u.role;
        socket.data.restaurantId = u.restaurantId;
        next();
      } catch {
        next(new Error("Unauthorized"));
      }
    })();
  });

  io.on("connection", (socket) => {
    const role = socket.data.role as string;
    const rid = socket.data.restaurantId as string;
    if (role === "KITCHEN" || role === "ADMIN") {
      void socket.join(`tenant:${rid}:kitchen`);
    }
    if (role === "ADMIN" || role === "CASHIER" || role === "WAITER") {
      void socket.join(`tenant:${rid}:floor`);
    }
  });
}
