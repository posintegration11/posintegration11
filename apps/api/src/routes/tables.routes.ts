import { Router } from "express";
import { OrderStatus, RestaurantTableStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authJwt, requireRole, requireTenantUser } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { emitToTenant } from "../realtime.js";
import { repairOrphanOrderLines } from "../services/orderRepair.js";
import { persistOrderTotals } from "../services/orderTotals.js";
import { writeAudit } from "../utils/audit.js";
import { makeOrderNumber } from "../utils/refs.js";

const router = Router();

router.use(authJwt);
router.use(requireTenantUser);

router.get("/", async (req, res, next) => {
  try {
    const rid = req.user!.restaurantId!;
    const tables = await prisma.restaurantTable.findMany({
      where: { restaurantId: rid },
      orderBy: { tableNumber: "asc" },
    });

    const orders = await prisma.order.findMany({
      where: {
        restaurantId: rid,
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

router.get("/:tableId/summary", async (req, res, next) => {
  try {
    const { tableId } = req.params;
    const rid = req.user!.restaurantId!;
    const table = await prisma.restaurantTable.findFirst({
      where: { id: tableId, restaurantId: rid },
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
  forceNew: z.boolean().optional(),
});

const nonTerminalStatuses = {
  notIn: [OrderStatus.PAID, OrderStatus.CLOSED, OrderStatus.CANCELLED],
};

router.post("/:tableId/orders", requireRole(...tableOrderRoles), async (req, res, next) => {
  try {
    const { tableId } = req.params;
    const rid = req.user!.restaurantId!;
    const table = await prisma.restaurantTable.findFirst({
      where: { id: tableId, restaurantId: rid },
    });
    if (!table) {
      throw new AppError(404, "Table not found");
    }

    const body = postOrderBodySchema.parse(
      req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {},
    );
    const forceNew = Boolean(table.isWalkIn && body.forceNew);

    if (forceNew) {
      const blocking = await prisma.order.findFirst({
        where: { tableId, restaurantId: rid, status: nonTerminalStatuses },
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
          restaurantId: rid,
          status: nonTerminalStatuses,
        },
        orderBy: { openedAt: "desc" },
      });
      if (active) {
        const full = await prisma.order.findFirst({
          where: { id: active.id, restaurantId: rid },
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
          restaurantId: rid,
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

    const order = await prisma.order.findFirst({
      where: { id: createdId, restaurantId: rid },
      include: {
        table: true,
        items: { orderBy: { id: "asc" } },
        kots: { include: { items: true }, orderBy: { createdAt: "desc" } },
      },
    });

    await writeAudit(req.user!.id, "ORDER_OPEN", "Order", createdId, { tableId }, rid);
    emitToTenant(rid, "table:updated");
    emitToTenant(rid, "order:updated", { orderId: createdId });
    res.status(201).json(order);
  } catch (e) {
    next(e);
  }
});

router.get("/:tableId/active-order", requireRole(...tableOrderRoles), async (req, res, next) => {
  try {
    const { tableId } = req.params;
    const rid = req.user!.restaurantId!;
    let order = await prisma.order.findFirst({
      where: {
        tableId,
        restaurantId: rid,
        status: nonTerminalStatuses,
      },
      orderBy: { openedAt: "desc" },
      include: {
        table: true,
        items: { orderBy: { id: "asc" } },
        kots: { include: { items: true }, orderBy: { createdAt: "desc" } },
      },
    });
    if (order) {
      const repaired = await repairOrphanOrderLines(order.id, rid);
      if (repaired) {
        emitToTenant(rid, "order:updated", { orderId: order.id });
        emitToTenant(rid, "table:updated");
      }
      await persistOrderTotals(order.id);
      order = await prisma.order.findFirst({
        where: { id: order.id, restaurantId: rid },
        include: {
          table: true,
          items: { orderBy: { id: "asc" } },
          kots: { include: { items: true }, orderBy: { createdAt: "desc" } },
        },
      });
    }
    res.json(order);
  } catch (e) {
    next(e);
  }
});

router.get("/:tableId/recent-tickets", requireRole(...tableOrderRoles), async (req, res, next) => {
  try {
    const { tableId } = req.params;
    const rid = req.user!.restaurantId!;
    const table = await prisma.restaurantTable.findFirst({
      where: { id: tableId, restaurantId: rid },
    });
    if (!table) {
      throw new AppError(404, "Table not found");
    }
    if (!table.isWalkIn) {
      throw new AppError(400, "Recent tickets walk-in counters only");
    }

    const orders = await prisma.order.findMany({
      where: { tableId, restaurantId: rid },
      orderBy: { openedAt: "desc" },
      take: 40,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        openedAt: true,
        closedAt: true,
        grandTotal: true,
        invoices: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { paymentStatus: true, invoiceNumber: true },
        },
      },
    });

    const payload = orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      openedAt: o.openedAt.toISOString(),
      closedAt: o.closedAt?.toISOString() ?? null,
      grandTotal: String(o.grandTotal),
      lastInvoice: o.invoices[0]
        ? {
            paymentStatus: o.invoices[0].paymentStatus,
            invoiceNumber: o.invoices[0].invoiceNumber,
          }
        : null,
    }));

    res.json(payload);
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
      const rid = req.user!.restaurantId!;
      const body = patchSchema.parse(req.body);
      const existing = await prisma.restaurantTable.findFirst({ where: { id, restaurantId: rid } });
      if (!existing) {
        throw new AppError(404, "Table not found");
      }
      const t = await prisma.restaurantTable.update({
        where: { id },
        data: body,
      });
      await writeAudit(req.user!.id, "TABLE_UPDATE", "RestaurantTable", id, body as Record<string, unknown>, rid);
      emitToTenant(rid, "table:updated");
      res.json(t);
    } catch (e) {
      next(e);
    }
  },
);

export const tablesRouter = router;
