import { Router } from "express";
import {
  KOTItemStatus,
  KOTStatus,
  OrderItemStatus,
  OrderStatus,
  RestaurantTableStatus,
  UserRole,
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authJwt, requireRole, requireTenantUser } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { emitToTenant } from "../realtime.js";
import { writeAudit } from "../utils/audit.js";
import { persistOrderTotals } from "../services/orderTotals.js";

const router = Router();

router.use(authJwt);
router.use(requireTenantUser);

const modifyRoles = [UserRole.ADMIN, UserRole.CASHIER, UserRole.WAITER] as const;
const billingRoles = [UserRole.ADMIN, UserRole.CASHIER] as const;

function terminalOrderStatuses(): OrderStatus[] {
  return [OrderStatus.PAID, OrderStatus.CLOSED, OrderStatus.CANCELLED];
}

function canEditItems(status: OrderStatus) {
  return !terminalOrderStatuses().includes(status) && status !== OrderStatus.READY_FOR_BILLING;
}

router.get("/:id", requireRole(UserRole.ADMIN, UserRole.CASHIER, UserRole.WAITER), async (req, res, next) => {
  try {
    const id = req.params.id;
    const rid = req.user!.restaurantId!;
    const order = await prisma.order.findFirst({
      where: { id, restaurantId: rid },
      include: {
        items: { orderBy: { id: "asc" } },
        table: true,
        invoices: { orderBy: { createdAt: "desc" } },
        kots: { include: { items: true }, orderBy: { createdAt: "desc" } },
      },
    });
    if (!order) {
      throw new AppError(404, "Order not found");
    }
    res.json(order);
  } catch (e) {
    next(e);
  }
});

const addItemSchema = z.object({
  menuItemId: z.string().uuid(),
  quantity: z.number().int().positive(),
  note: z.string().optional(),
});

router.post("/:id/items", requireRole(...modifyRoles), async (req, res, next) => {
  try {
    const orderId = z.string().uuid().parse(req.params.id);
    const rid = req.user!.restaurantId!;
    const body = addItemSchema.parse(req.body);

    const order = await prisma.order.findFirst({ where: { id: orderId, restaurantId: rid } });
    if (!order) {
      throw new AppError(404, "Order not found");
    }
    if (!canEditItems(order.status)) {
      throw new AppError(400, "Cannot modify items for this order");
    }

    const menuItem = await prisma.menuItem.findFirst({
      where: {
        id: body.menuItemId,
        isAvailable: true,
        category: { restaurantId: rid },
      },
    });
    if (!menuItem) {
      throw new AppError(404, "Menu item not found");
    }

    const price = Number(menuItem.price);
    const noteVal = body.note === undefined || body.note === "" ? null : body.note;

    const lineMatchWhere = {
      orderId,
      menuItemId: menuItem.id,
      status: OrderItemStatus.ADDED,
      ...(noteVal === null ? { note: null } : { note: noteVal }),
    } as const;

    const { item, created } = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT id FROM orders WHERE id::text = $1 FOR UPDATE`, orderId);

      const duplicates = await tx.orderItem.findMany({
        where: lineMatchWhere,
        orderBy: { id: "asc" },
      });

      if (duplicates.length > 1) {
        const keep = duplicates[0];
        const mergedQty = duplicates.reduce((s, l) => s + l.quantity, 0);
        const unit = Number(keep.itemPriceSnapshot);
        await tx.orderItem.update({
          where: { id: keep.id },
          data: {
            quantity: mergedQty,
            lineTotal: String(unit * mergedQty),
          },
        });
        await tx.orderItem.deleteMany({
          where: { id: { in: duplicates.slice(1).map((l) => l.id) } },
        });
      }

      const existing = await tx.orderItem.findFirst({
        where: lineMatchWhere,
        orderBy: { id: "asc" },
      });

      const nextStatus =
        order.status === OrderStatus.OPEN ? OrderStatus.RUNNING : order.status;
      if (nextStatus !== order.status) {
        await tx.order.update({
          where: { id: orderId },
          data: { status: nextStatus },
        });
      }

      if (existing) {
        const current = await tx.orderItem.findUniqueOrThrow({ where: { id: existing.id } });
        const unit = Number(current.itemPriceSnapshot);
        const newQty = current.quantity + body.quantity;
        const newLineTotal = unit * newQty;
        const row = await tx.orderItem.update({
          where: { id: existing.id },
          data: {
            quantity: newQty,
            lineTotal: String(newLineTotal),
          },
        });
        return { item: row, created: false };
      }

      const lineTotal = price * body.quantity;
      const row = await tx.orderItem.create({
        data: {
          orderId,
          menuItemId: menuItem.id,
          itemNameSnapshot: menuItem.name,
          itemPriceSnapshot: String(price),
          quantity: body.quantity,
          note: noteVal,
          status: OrderItemStatus.ADDED,
          lineTotal: String(lineTotal),
        },
      });
      return { item: row, created: true };
    });

    if (created) {
      await writeAudit(
        req.user!.id,
        "ORDER_ITEM_ADD",
        "OrderItem",
        item.id,
        {
          orderId,
          menuItemId: body.menuItemId,
        },
        rid
      );
    } else {
      await writeAudit(
        req.user!.id,
        "ORDER_ITEM_QTY_ADD",
        "OrderItem",
        item.id,
        {
          orderId,
          menuItemId: body.menuItemId,
          quantityAdded: body.quantity,
        },
        rid
      );
    }
    emitToTenant(rid, "order:updated", { orderId });
    emitToTenant(rid, "table:updated");
    res.status(created ? 201 : 200).json(item);
  } catch (e) {
    next(e);
  }
});

const patchItemSchema = z.object({
  quantity: z.number().int().positive().optional(),
  note: z.string().optional().nullable(),
});

router.patch("/:id/items/:itemId", requireRole(...modifyRoles), async (req, res, next) => {
  try {
    const { id: orderId, itemId } = req.params;
    const rid = req.user!.restaurantId!;
    const body = patchItemSchema.parse(req.body);

    const order = await prisma.order.findFirst({ where: { id: orderId, restaurantId: rid } });
    if (!order) {
      throw new AppError(404, "Order not found");
    }
    if (!canEditItems(order.status)) {
      throw new AppError(400, "Cannot modify items for this order");
    }

    const existing = await prisma.orderItem.findFirst({
      where: { id: itemId, orderId },
    });
    if (!existing || existing.status === OrderItemStatus.CANCELLED) {
      throw new AppError(404, "Order line not found");
    }
    if (existing.status !== OrderItemStatus.ADDED) {
      throw new AppError(400, "Only draft lines can be edited");
    }

    const qty = body.quantity ?? existing.quantity;
    const price = Number(existing.itemPriceSnapshot);
    const lineTotal = price * qty;

    const updated = await prisma.orderItem.update({
      where: { id: itemId },
      data: {
        quantity: qty,
        note: body.note !== undefined ? body.note : existing.note,
        lineTotal: String(lineTotal),
      },
    });

    await writeAudit(
      req.user!.id,
      "ORDER_ITEM_UPDATE",
      "OrderItem",
      itemId,
      body as Record<string, unknown>,
      rid
    );
    emitToTenant(rid, "order:updated", { orderId });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

router.delete("/:id/items/:itemId", requireRole(...modifyRoles), async (req, res, next) => {
  try {
    const { id: orderId, itemId } = req.params;
    const rid = req.user!.restaurantId!;

    const order = await prisma.order.findFirst({ where: { id: orderId, restaurantId: rid } });
    if (!order) {
      throw new AppError(404, "Order not found");
    }
    if (!canEditItems(order.status)) {
      throw new AppError(400, "Cannot cancel items for this order");
    }

    const existing = await prisma.orderItem.findFirst({
      where: { id: itemId, orderId },
    });
    if (!existing || existing.status === OrderItemStatus.CANCELLED) {
      throw new AppError(404, "Order line not found");
    }

    const updated = await prisma.orderItem.update({
      where: { id: itemId },
      data: { status: OrderItemStatus.CANCELLED, lineTotal: "0" },
    });

    await writeAudit(
      req.user!.id,
      "ORDER_ITEM_CANCEL",
      "OrderItem",
      itemId,
      {
        orderId,
        previousStatus: existing.status,
      },
      rid
    );
    emitToTenant(rid, "order:updated", { orderId });
    emitToTenant(rid, "table:updated");
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

router.post("/:id/send-to-kitchen", requireRole(...modifyRoles), async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const rid = req.user!.restaurantId!;

    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId: rid },
      include: { items: true, table: true },
    });
    if (!order) {
      throw new AppError(404, "Order not found");
    }
    if (terminalOrderStatuses().includes(order.status)) {
      throw new AppError(400, "Invalid order state");
    }

    const toSend = order.items.filter((i) => i.status === OrderItemStatus.ADDED);
    if (toSend.length === 0) {
      throw new AppError(400, "No new items to send to kitchen");
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.kot.create({
        data: {
          orderId: order.id,
          tableId: order.tableId,
          status: KOTStatus.PENDING,
          items: {
            create: toSend.map((i) => ({
              orderItemId: i.id,
              quantity: i.quantity,
              note: i.note,
              status: KOTItemStatus.PENDING,
            })),
          },
        },
      });

      await tx.orderItem.updateMany({
        where: { id: { in: toSend.map((x) => x.id) } },
        data: { status: OrderItemStatus.SENT_TO_KITCHEN, sentToKitchenAt: now },
      });

      await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.KOT_SENT },
      });
    });

    await writeAudit(req.user!.id, "KOT_SENT", "Order", orderId, { itemCount: toSend.length }, rid);
    emitToTenant(rid, "kot:updated");
    emitToTenant(rid, "order:updated", { orderId });
    emitToTenant(rid, "table:updated");
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post("/:id/ready-for-billing", requireRole(...billingRoles), async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const rid = req.user!.restaurantId!;

    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId: rid },
      include: { items: true },
    });
    if (!order) {
      throw new AppError(404, "Order not found");
    }
    if (terminalOrderStatuses().includes(order.status)) {
      throw new AppError(400, "Invalid order state");
    }

    const hasBillable = order.items.some((i) => i.status !== OrderItemStatus.CANCELLED);
    if (!hasBillable) {
      throw new AppError(400, "No items on order");
    }

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.READY_FOR_BILLING },
      });
      await tx.restaurantTable.update({
        where: { id: order.tableId },
        data: { status: RestaurantTableStatus.BILLING_PENDING },
      });
    });

    await persistOrderTotals(orderId);

    await writeAudit(req.user!.id, "ORDER_READY_BILLING", "Order", orderId, {}, rid);
    emitToTenant(rid, "table:updated");
    emitToTenant(rid, "order:updated", { orderId });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export const ordersRouter = router;
