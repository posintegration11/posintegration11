import { Router } from "express";
import { RestaurantStatus, UserRole, UserStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authJwt, requirePlatformAllowlist, requireRole } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { writeAudit } from "../utils/audit.js";

const router = Router();

router.use(authJwt);
router.use(requireRole(UserRole.SUPER_ADMIN));
router.use(requirePlatformAllowlist);

router.get("/restaurants", async (_req, res, next) => {
  try {
    const rows = await prisma.restaurant.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        settings: { select: { name: true } },
        _count: { select: { users: true } },
      },
    });

    const payload = rows.map((r) => ({
      id: r.id,
      name: r.name,
      address: r.address,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      displayName: r.settings?.name ?? r.name,
      userCount: r._count.users,
    }));

    res.json({ restaurants: payload, total: payload.length });
  } catch (e) {
    next(e);
  }
});

const patchSchema = z.object({
  status: z.nativeEnum(RestaurantStatus),
});

router.patch("/restaurants/:id", async (req, res, next) => {
  try {
    const id = req.params.id;
    const body = patchSchema.parse(req.body);
    if (body.status === RestaurantStatus.PENDING_VERIFICATION) {
      throw new AppError(400, "Cannot set status back to pending from platform");
    }
    const existing = await prisma.restaurant.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(404, "Restaurant not found");
    }

    /** Manual approval: email verify na hua ho to bhi owner/staff INACTIVE → ACTIVE + tokens close */
    if (
      body.status === RestaurantStatus.ACTIVE &&
      existing.status === RestaurantStatus.PENDING_VERIFICATION
    ) {
      const r = await prisma.$transaction(async (tx) => {
        await tx.user.updateMany({
          where: { restaurantId: id, status: UserStatus.INACTIVE },
          data: { status: UserStatus.ACTIVE },
        });
        const userIds = await tx.user.findMany({
          where: { restaurantId: id },
          select: { id: true },
        });
        await tx.emailVerificationToken.updateMany({
          where: { userId: { in: userIds.map((u) => u.id) }, usedAt: null },
          data: { usedAt: new Date() },
        });
        return tx.restaurant.update({
          where: { id },
          data: { status: RestaurantStatus.ACTIVE },
        });
      });
      await writeAudit(
        req.user!.id,
        "PLATFORM_RESTAURANT_VERIFY",
        "Restaurant",
        id,
        { status: body.status, manualApproval: true },
        null,
      );
      res.json(r);
      return;
    }

    const r = await prisma.restaurant.update({
      where: { id },
      data: { status: body.status },
    });
    await writeAudit(req.user!.id, "PLATFORM_RESTAURANT_STATUS", "Restaurant", id, { status: body.status }, null);
    res.json(r);
  } catch (e) {
    next(e);
  }
});

export const platformRouter = router;
