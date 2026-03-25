import { Router } from "express";
import {
  Prisma,
  KOTItemStatus,
  KOTStatus,
  OrderItemStatus,
  UserRole,
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authJwt, requireRole } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { emitAll } from "../realtime.js";
import { writeAudit } from "../utils/audit.js";

const router = Router();

router.use(authJwt);

const kitchenRoles = [UserRole.KITCHEN, UserRole.ADMIN] as const;
const viewRoles = [UserRole.KITCHEN, UserRole.ADMIN, UserRole.CASHIER] as const;

function orderItemFromKotItem(status: KOTItemStatus): OrderItemStatus {
  switch (status) {
    case KOTItemStatus.PENDING:
      return OrderItemStatus.SENT_TO_KITCHEN;
    case KOTItemStatus.PREPARING:
      return OrderItemStatus.PREPARING;
    case KOTItemStatus.READY:
      return OrderItemStatus.READY;
    case KOTItemStatus.SERVED:
      return OrderItemStatus.SERVED;
    default:
      return OrderItemStatus.SENT_TO_KITCHEN;
  }
}

router.get("/", requireRole(...viewRoles), async (req, res, next) => {
  try {
    const status = req.query.status as string | undefined;
    const includeCompleted = req.query.includeCompleted === "true";

    let where: Prisma.KotWhereInput | undefined;
    if (status) {
      where = { status: status as KOTStatus };
    } else if (!includeCompleted) {
      where = {
        status: { in: [KOTStatus.PENDING, KOTStatus.PREPARING, KOTStatus.READY] },
      };
    }

    const kots = await prisma.kot.findMany({
      where,
      orderBy: { createdAt: "asc" },
      include: {
        table: true,
        order: { select: { id: true, orderNumber: true, status: true } },
        items: {
          include: {
            orderItem: true,
          },
        },
      },
    });
    res.json(kots);
  } catch (e) {
    next(e);
  }
});

const patchKotSchema = z.object({
  status: z.nativeEnum(KOTStatus),
});

router.patch("/:id", requireRole(...kitchenRoles), async (req, res, next) => {
  try {
    const id = req.params.id;
    const body = patchKotSchema.parse(req.body);
    const kot = await prisma.kot.update({
      where: { id },
      data: { status: body.status },
    });
    await writeAudit(req.user!.id, "KOT_STATUS", "Kot", id, { status: body.status });
    emitAll("kot:updated");
    res.json(kot);
  } catch (e) {
    next(e);
  }
});

const patchKotItemSchema = z.object({
  status: z.nativeEnum(KOTItemStatus),
});

router.patch("/items/:itemId", requireRole(...kitchenRoles), async (req, res, next) => {
  try {
    const itemId = req.params.itemId;
    const body = patchKotItemSchema.parse(req.body);

    const kotItem = await prisma.kotItem.findUnique({
      where: { id: itemId },
      include: { kot: true },
    });
    if (!kotItem) {
      throw new AppError(404, "KOT item not found");
    }

    const orderItemStatus = orderItemFromKotItem(body.status);

    await prisma.$transaction(async (tx) => {
      await tx.kotItem.update({
        where: { id: itemId },
        data: { status: body.status },
      });
      await tx.orderItem.update({
        where: { id: kotItem.orderItemId },
        data: { status: orderItemStatus },
      });
    });

    await writeAudit(req.user!.id, "KOT_ITEM_STATUS", "KotItem", itemId, {
      status: body.status,
    });
    emitAll("kot:updated");
    emitAll("order:updated", { orderId: kotItem.kot.orderId });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export const kotRouter = router;
