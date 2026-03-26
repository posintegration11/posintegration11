import { createHash, randomBytes } from "crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import {
  RestaurantTableStatus,
  RestaurantStatus,
  UserRole,
  UserStatus,
} from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authJwt, signAccessToken } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { getEnv } from "../config/env.js";
import { sendVerificationEmail } from "../services/mail.js";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: body.email },
      include: { restaurant: true },
    });
    if (!user) {
      throw new AppError(401, "Invalid credentials");
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new AppError(401, "Account is inactive. Check your email for a verification link.");
    }
    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) {
      throw new AppError(401, "Invalid credentials");
    }
    if (user.role !== UserRole.SUPER_ADMIN) {
      if (!user.restaurantId || !user.restaurant) {
        throw new AppError(403, "No restaurant assigned");
      }
      if (user.restaurant.status === RestaurantStatus.SUSPENDED) {
        throw new AppError(403, "This account has been suspended");
      }
      if (user.restaurant.status === RestaurantStatus.PENDING_VERIFICATION) {
        throw new AppError(403, "Verify your email before signing in");
      }
    }

    const token = signAccessToken(user.id);
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        restaurantId: user.restaurantId,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.get("/me", authJwt, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, name: true, email: true, role: true, status: true, restaurantId: true },
    });
    if (!user) {
      throw new AppError(404, "User not found");
    }
    res.json(user);
  } catch (e) {
    next(e);
  }
});

const registerTenantSchema = z.object({
  restaurantName: z.string().min(1).max(200),
  address: z.string().max(2000).optional().default(""),
  adminName: z.string().min(1).max(200),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

async function createDefaultTables(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  tableCount: number
) {
  await tx.restaurantTable.create({
    data: {
      restaurantId,
      tableNumber: 0,
      name: "Walk-in",
      capacity: null,
      isWalkIn: true,
      status: RestaurantTableStatus.FREE,
    },
  });
  for (let n = 1; n <= tableCount; n++) {
    await tx.restaurantTable.create({
      data: {
        restaurantId,
        tableNumber: n,
        name: `Table ${n}`,
        capacity: 4,
        isWalkIn: false,
        status: RestaurantTableStatus.FREE,
      },
    });
  }
}

router.post("/register-tenant", async (req, res, next) => {
  try {
    const body = registerTenantSchema.parse(req.body);
    const exists = await prisma.user.findUnique({ where: { email: body.email } });
    if (exists) {
      throw new AppError(409, "An account with this email already exists");
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const { userId } = await prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.create({
        data: {
          name: body.restaurantName.trim(),
          address: body.address?.trim() ?? "",
          status: RestaurantStatus.PENDING_VERIFICATION,
        },
      });

      await tx.restaurantSettings.create({
        data: {
          restaurantId: restaurant.id,
          name: body.restaurantName.trim(),
          address: body.address?.trim() ?? "",
          tableCount: 10,
        },
      });

      await createDefaultTables(tx, restaurant.id, 10);

      const user = await tx.user.create({
        data: {
          name: body.adminName.trim(),
          email: body.email.toLowerCase().trim(),
          passwordHash,
          role: UserRole.ADMIN,
          status: UserStatus.INACTIVE,
          restaurantId: restaurant.id,
        },
      });

      await tx.emailVerificationToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });

      return { userId: user.id };
    });

    const env = getEnv();
    const base = env.APP_PUBLIC_URL.replace(/\/$/, "");
    const verifyUrl = `${base}/verify-email?token=${encodeURIComponent(rawToken)}`;
    await sendVerificationEmail(body.email.toLowerCase().trim(), verifyUrl);

    const exposeLink = !env.SMTP_HOST && env.EXPOSE_VERIFY_LINK_WITHOUT_SMTP;
    res.status(201).json({
      ok: true,
      message: exposeLink
        ? "SMTP not configured — verifyUrl included for testing only."
        : "Check your email to verify and activate your account.",
      userId,
      ...(exposeLink ? { verifyUrl } : {}),
    });
  } catch (e) {
    next(e);
  }
});

const verifySchema = z.object({
  token: z.string().min(16),
});

router.post("/verify-email", async (req, res, next) => {
  try {
    const body = verifySchema.parse(req.body);
    const tokenHash = createHash("sha256").update(body.token).digest("hex");
    const row = await prisma.emailVerificationToken.findFirst({
      where: { tokenHash, usedAt: null },
      include: { user: { include: { restaurant: true } } },
    });
    if (!row || row.expiresAt < new Date()) {
      throw new AppError(400, "Invalid or expired verification link");
    }

    await prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      });
      await tx.user.update({
        where: { id: row.userId },
        data: { status: UserStatus.ACTIVE },
      });
      await tx.restaurant.update({
        where: { id: row.user.restaurantId! },
        data: { status: RestaurantStatus.ACTIVE },
      });
    });

    res.json({ ok: true, message: "Email verified. You can sign in now." });
  } catch (e) {
    next(e);
  }
});

export const authRouter = router;
