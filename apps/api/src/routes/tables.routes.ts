import { Router } from "express";
import { OrderStatus, RestaurantTableStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authJwt, requireRole } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { emitAll } from "../realtime.js";
import { writeAudit } from "../utils/audit.js";
import { makeOrderNumber } from "../utils/refs.js";

const router = Router();

router.use(authJwt);

router.get("/", async (_req, res, next) => {
  try {
    const tables = await prisma.restaurantTable.findMany({
      orderBy: { tableNumber: "asc" },
    });

    const orders = await prisma.order.findMany({
      where: {
        status: {
          in: [
            OrderStatus.OPEN,
            OrderStatus.RUNNING,
            OrderStatus.KOT_SENT,
            OrderStatus.READY_FOR_BILLING,
          ],
        },
      },
      include: { items: { where: { status: { not: "CANCELLED" } } } },
      orderBy: { openedAt: "desc" },
    });

    /** Newest non-terminal order per table (matches GET /tables/:id/active-order). */
    const byTable = new Map<string, (typeof orders)[0]>();
    for (const o of orders) {
      if (!byTable.has(o.tableId)) {
        byTable.set(o.tableId, o);
      }
    }

    const payload = tables.map((t) => {
      const o = byTable.get(t.id);
      let activeTotal = 0;
      if (o) {
        for (const it of o.items) {
          activeTotal += Number(it.lineTotal);
        }
      }
      return {
        ...t,
        activeOrderId: o?.id ?? null,
        activeTotal,
        openedAt: o?.openedAt ?? null,
      };
    });

    res.json(payload);
  } catch (e) {
    next(e);
  }
});

/** Small payload for order screen to detect walk-in without listing all tables. */
router.get("/:tableId/summary", async (req, res, next) => {
  try {
    const { tableId } = req.params;
    const table = await prisma.restaurantTable.findUnique({
      where: { id: tableId },
      select: {
        id: true,
        tableNumber: true,
        name: true,
        isWalkIn: true,
        status: true,
      },
    });
    if (!table) {
      throw new AppError(404, "Table not found");
    }
    res.json(table);
  } catch (e) {
    next(e);
  }
});

const tableOrderRoles = [UserRole.ADMIN, UserRole.CASHIER, UserRole.WAITER] as const;

const postOrderBodySchema = z.object({
  /** Walk-in only: create a new ticket even after the previous one is fully closed (never while another is still open). */
  forceNew: z.boolean().optional(),
});

const nonTerminalStatuses = {
  notIn: [OrderStatus.PAID, OrderStatus.CLOSED, OrderStatus.CANCELLED] as const,
};

router.post("/:tableId/orders", requireRole(...tableOrderRoles), async (req, res, next) => {
  try {
    const { tableId } = req.params;
    const table = await prisma.restaurantTable.findUnique({ where: { id: tableId } });
    if (!table) {
      throw new AppError(404, "Table not found");
    }

    const body = postOrderBodySchema.parse(
      req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {},
    );
    const forceNew = Boolean(table.isWalkIn && body.forceNew);

    if (forceNew) {
      const blocking = await prisma.order.findFirst({
        where: { tableId, status: nonTerminalStatuses },
      });
      if (blocking) {
        throw new AppError(
          400,
          "Bill or close the open walk-in order before starting a new ticket.",
        );
      }
    }

    if (!forceNew) {
      const active = await prisma.order.findFirst({
        where: {
          tableId,
          status: nonTerminalStatuses,
        },
        orderBy: { openedAt: "desc" },
      });
      if (active) {
        const full = await prisma.order.findUnique({
          where: { id: active.id },
          include: {
            table: true,
            items: { orderBy: { id: "asc" } },
            kots: { include: { items: true }, orderBy: { createdAt: "desc" } },
          },
        });
        return res.status(200).json(full);
      }
    }

    const createdId = await prisma.$transaction(async (tx) => {
      const o = await tx.order.create({
        data: {
          orderNumber: makeOrderNumber(),
          tableId,
          createdById: req.user!.id,
          status: OrderStatus.OPEN,
        },
      });
      if (!table.isWalkIn) {
        await tx.restaurantTable.update({
          where: { id: tableId },
          data: { status: RestaurantTableStatus.OCCUPIED },
        });
      }
      return o.id;
    });

    const order = await prisma.order.findUnique({
      where: { id: createdId },
      include: {
        table: true,
        items: { orderBy: { id: "asc" } },
        kots: { include: { items: true }, orderBy: { createdAt: "desc" } },
      },
    });

    await writeAudit(req.user!.id, "ORDER_OPEN", "Order", createdId, { tableId });
    emitAll("table:updated");
    emitAll("order:updated", { orderId: createdId });
    res.status(201).json(order);
  } catch (e) {
    next(e);
  }
});

router.get("/:tableId/active-order", requireRole(...tableOrderRoles), async (req, res, next) => {
  try {
    const { tableId } = req.params;
    const order = await prisma.order.findFirst({
      where: {
        tableId,
        status: nonTerminalStatuses,
      },
      orderBy: { openedAt: "desc" },
      include: {
        table: true,
        items: { orderBy: { id: "asc" } },
        kots: { include: { items: true }, orderBy: { createdAt: "desc" } },
      },
    });
    res.json(order);
  } catch (e) {
    next(e);
  }
});

const patchSchema = z.object({
  name: z.string().optional(),
  capacity: z.number().int().positive().optional(),
});

router.patch(
  "/:id",
  requireRole(UserRole.ADMIN),
  async (req, res, next) => {
    try {
      const id = req.params.id;
      const body = patchSchema.parse(req.body);
      const t = await prisma.restaurantTable.update({
        where: { id },
        data: body,
      });
      await writeAudit(req.user!.id, "TABLE_UPDATE", "RestaurantTable", id, body as Record<string, unknown>);
      emitAll("table:updated");
      res.json(t);
    } catch (e) {
      next(e);
    }
  }
);

export const tablesRouter = router;
