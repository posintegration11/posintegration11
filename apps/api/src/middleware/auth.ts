import type { NextFunction, Request, Response } from "express";
import jwt, { type SignOptions } from "jsonwebtoken";
import type { UserRole } from "@prisma/client";
import { getEnv } from "../config/env.js";
import { AppError } from "./errorHandler.js";
import { prisma } from "../prisma.js";

export type AuthPayload = { sub: string; role: UserRole; email: string };

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: UserRole; email: string };
    }
  }
}

export function signToken(payload: AuthPayload): string {
  const env = getEnv();
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as SignOptions);
}

export function authJwt(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return next(new AppError(401, "Unauthorized"));
  }
  try {
    const decoded = jwt.verify(token, getEnv().JWT_SECRET) as AuthPayload;
    req.user = { id: decoded.sub, role: decoded.role, email: decoded.email };
    next();
  } catch {
    next(new AppError(401, "Invalid token"));
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, "Unauthorized"));
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError(403, "Forbidden"));
    }
    next();
  };
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return next();
  }
  try {
    const decoded = jwt.verify(token, getEnv().JWT_SECRET) as AuthPayload;
    const u = await prisma.user.findUnique({ where: { id: decoded.sub } });
    if (u && u.status === "ACTIVE") {
      req.user = { id: u.id, role: u.role, email: u.email };
    }
  } catch {
    /* ignore */
  }
  next();
}
