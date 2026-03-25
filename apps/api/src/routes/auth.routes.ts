import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authJwt, signToken } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || user.status !== "ACTIVE") {
      throw new AppError(401, "Invalid credentials");
    }
    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) {
      throw new AppError(401, "Invalid credentials");
    }
    const token = signToken({ sub: user.id, role: user.role, email: user.email });
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (e) {
    next(e);
  }
});

router.get("/me", authJwt, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, name: true, email: true, role: true, status: true },
    });
    if (!user) {
      throw new AppError(404, "User not found");
    }
    res.json(user);
  } catch (e) {
    next(e);
  }
});

export const authRouter = router;
