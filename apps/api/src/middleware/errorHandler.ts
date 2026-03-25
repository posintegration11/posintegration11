import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message, code: err.code });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Validation failed", details: err.flatten() });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    console.error("[Prisma]", err.code, err.message, err.meta);
    const dev = process.env.NODE_ENV !== "production";
    const hint =
      err.code === "P2021" || err.code === "P1001"
        ? " Run: npm run db:push (or db:migrate) and npm run db:seed. Check DATABASE_URL (Supabase often needs ?schema=public and sslmode=require)."
        : "";
    return res.status(500).json({
      error: dev ? `${err.message}${hint}` : "Database error",
      code: dev ? err.code : undefined,
    });
  }
  if (err instanceof Prisma.PrismaClientInitializationError) {
    console.error("[Prisma init]", err.message);
    const dev = process.env.NODE_ENV !== "production";
    return res.status(500).json({
      error: dev ? err.message : "Database unavailable",
    });
  }
  console.error(err);
  const dev = process.env.NODE_ENV !== "production";
  const message =
    dev && err instanceof Error && err.message ? err.message : "Internal server error";
  return res.status(500).json({ error: message });
}
