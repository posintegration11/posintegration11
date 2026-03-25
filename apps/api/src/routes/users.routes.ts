import { Router } from "express";
import bcrypt from "bcryptjs";
import { UserRole, UserStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authJwt, requireRole } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { writeAudit } from "../utils/audit.js";

const router = Router();

router.use(authJwt);
router.use(requireRole(UserRole.ADMIN));

router.get("/", async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    res.json(users);
  } catch (e) {
    next(e);
  }
});

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.nativeEnum(UserRole),
});

router.post("/", async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const exists = await prisma.user.findUnique({ where: { email: body.email } });
    if (exists) {
      throw new AppError(409, "Email already in use");
    }
    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        passwordHash,
        role: body.role,
        status: UserStatus.ACTIVE,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });
    await writeAudit(req.user!.id, "USER_CREATE", "User", user.id, { email: user.email });
    res.status(201).json(user);
  } catch (e) {
    next(e);
  }
});

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.nativeEnum(UserRole).optional(),
  status: z.nativeEnum(UserStatus).optional(),
});

router.patch("/:id", async (req, res, next) => {
  try {
    const id = req.params.id;
    const body = patchSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id },
      data: body,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        updatedAt: true,
      },
    });
    await writeAudit(req.user!.id, "USER_UPDATE", "User", id, body as Record<string, unknown>);
    res.json(user);
  } catch (e) {
    next(e);
  }
});

const resetSchema = z.object({
  password: z.string().min(6),
});

router.post("/:id/reset-password", async (req, res, next) => {
  try {
    const id = req.params.id;
    const body = resetSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(body.password, 10);
    await prisma.user.update({ where: { id }, data: { passwordHash } });
    await writeAudit(req.user!.id, "USER_RESET_PASSWORD", "User", id, {});
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export const usersRouter = router;
