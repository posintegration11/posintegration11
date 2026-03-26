import type { NextFunction, Request, Response } from "express";
import jwt, { type SignOptions } from "jsonwebtoken";
import { UserRole, UserStatus } from "@prisma/client";
import { getEnv, platformAdminEmails } from "../config/env.js";
import { AppError } from "./errorHandler.js";
import { prisma } from "../prisma.js";

export type RequestUser = {
  id: string;
  role: UserRole;
  email: string;
  restaurantId: string | null;
};

declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
    }
  }
}

/** Minimal JWT: only `sub` (user id). Role/tenant loaded from DB each request. */
export function signAccessToken(userId: string): string {
  const env = getEnv();
  return jwt.sign({ sub: userId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as SignOptions);
}

export function authJwt(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return next(new AppError(401, "Unauthorized"));
  }
  void (async () => {
    try {
      const env = getEnv();
      const decoded = jwt.verify(token, env.JWT_SECRET) as { sub: string };
      const u = await prisma.user.findUnique({
        where: { id: decoded.sub },
        select: { id: true, email: true, role: true, restaurantId: true, status: true },
      });
      if (!u || u.status !== UserStatus.ACTIVE) {
        return next(new AppError(401, "Unauthorized"));
      }
      req.user = {
        id: u.id,
        email: u.email,
        role: u.role,
        restaurantId: u.restaurantId,
      };
      next();
    } catch {
      next(new AppError(401, "Invalid token"));
    }
  })();
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

/** POS + tenant APIs: blocks SUPER_ADMIN and users without a restaurant. */
export function requireTenantUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    return next(new AppError(401, "Unauthorized"));
  }
  if (req.user.role === UserRole.SUPER_ADMIN) {
    return next(new AppError(403, "Platform admins use the /platform console, not the POS app"));
  }
  if (!req.user.restaurantId) {
    return next(new AppError(403, "No restaurant assigned"));
  }
  next();
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return next();
  }
  try {
    const env = getEnv();
    const decoded = jwt.verify(token, env.JWT_SECRET) as { sub: string };
    const u = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, email: true, role: true, restaurantId: true, status: true },
    });
    if (u && u.status === UserStatus.ACTIVE) {
      req.user = {
        id: u.id,
        email: u.email,
        role: u.role,
        restaurantId: u.restaurantId,
      };
    }
  } catch {
    /* ignore */
  }
  next();
}

export function requirePlatformAllowlist(req: Request, _res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== UserRole.SUPER_ADMIN) {
    return next(new AppError(403, "Forbidden"));
  }
  const allow = platformAdminEmails();
  if (allow.length === 0 || !allow.includes(req.user.email.toLowerCase())) {
    return next(new AppError(403, "Forbidden"));
  }
  next();
}
