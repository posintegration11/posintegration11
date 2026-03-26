import { Router } from "express";
import {
  OrderStatus,
  PaymentMode,
  PaymentStatus,
  RestaurantTableStatus,
  UserRole,
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authJwt, requireRole, requireTenantUser } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { emitToTenant } from "../realtime.js";
import { writeAudit } from "../utils/audit.js";
import { makeInvoiceNumber } from "../utils/refs.js";
import { persistOrderTotals } from "../services/orderTotals.js";

const router = Router();

router.use(authJwt);
router.use(requireTenantUser);

const billingRoles = [UserRole.ADMIN, UserRole.CASHIER] as const;

const recalcSchema = z.object({
  discountTotal: z.number().min(0).optional(),
});

router.post("/orders/:orderId/recalculate", requireRole(...billingRoles), async (req, res, next) => {
  try {
    const orderId = req.params.orderId;
    const rid = req.user!.restaurantId!;

    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId: rid },
    });
    if (!order) {
      throw new AppError(404, "Order not found");
    }
    if (order.status !== OrderStatus.READY_FOR_BILLING) {
      throw new AppError(400, "Order must be ready for billing to recalculate");
    }

    const body = recalcSchema.parse(req.body);

    const discountTotal = body.discountTotal ?? Number(order.discountTotal);
    const updated = await persistOrderTotals(orderId, discountTotal);
    if (!updated) {
      throw new AppError(404, "Order not found");
    }

    const subtotal = Number(updated.subtotal);
    const taxTotal = Number(updated.taxTotal);
    const grandTotal = Number(updated.grandTotal);

    await writeAudit(req.user!.id, "ORDER_RECALCULATE", "Order", orderId, {
      subtotal,
      discountTotal,
      taxTotal,
      grandTotal,
    }, rid);
    emitToTenant(rid, "order:updated", { orderId });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

router.post("/orders/:orderId/invoice", requireRole(...billingRoles), async (req, res, next) => {
  try {
    const orderId = req.params.orderId;
    const rid = req.user!.restaurantId!;

    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId: rid },
      include: { invoices: true },
    });
    if (!order) {
      throw new AppError(404, "Order not found");
    }
    if (order.status !== OrderStatus.READY_FOR_BILLING) {
      throw new AppError(400, "Order must be ready for billing");
    }

    const unpaid = order.invoices.find((i) => i.paymentStatus === PaymentStatus.UNPAID);
    if (unpaid) {
      return res.json(unpaid);
    }

    const invoice = await prisma.invoice.create({
      data: {
        restaurantId: rid,
        orderId,
        invoiceNumber: makeInvoiceNumber(),
        subtotal: order.subtotal,
        taxTotal: order.taxTotal,
        discountTotal: order.discountTotal,
        grandTotal: order.grandTotal,
        paymentStatus: PaymentStatus.UNPAID,
      },
    });

    await writeAudit(req.user!.id, "INVOICE_CREATE", "Invoice", invoice.id, { orderId }, rid);
    emitToTenant(rid, "order:updated", { orderId });
    res.status(201).json(invoice);
  } catch (e) {
    next(e);
  }
});

const paySchema = z.object({
  payments: z
    .array(
      z.object({
        amount: z.number().positive(),
        mode: z.nativeEnum(PaymentMode),
        reference: z.string().optional(),
      })
    )
    .min(1),
});

router.post("/invoices/:invoiceId/pay", requireRole(...billingRoles), async (req, res, next) => {
  try {
    const invoiceId = req.params.invoiceId;
    const rid = req.user!.restaurantId!;
    const body = paySchema.parse(req.body);

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, restaurantId: rid },
      include: { order: true, payments: true },
    });
    if (!invoice) {
      throw new AppError(404, "Invoice not found");
    }
    if (invoice.paymentStatus === PaymentStatus.PAID) {
      throw new AppError(400, "Already paid");
    }

    const grand = Number(invoice.grandTotal);
    const paid = body.payments.reduce((a, p) => a + p.amount, 0);
    if (Math.abs(paid - grand) > 0.009) {
      throw new AppError(400, "Payment total must match invoice grand total");
    }

    const primaryMode =
      body.payments.length === 1 ? body.payments[0].mode : PaymentMode.CASH;

    await prisma.$transaction(async (tx) => {
      for (const p of body.payments) {
        await tx.payment.create({
          data: {
            invoiceId,
            amount: String(p.amount),
            mode: p.mode,
            reference: p.reference ?? null,
          },
        });
      }
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          paymentStatus: PaymentStatus.PAID,
          paymentMode: primaryMode,
        },
      });
      await tx.order.update({
        where: { id: invoice.orderId },
        data: {
          status: OrderStatus.CLOSED,
          closedAt: new Date(),
        },
      });
      await tx.restaurantTable.update({
        where: { id: invoice.order.tableId },
        data: { status: RestaurantTableStatus.FREE },
      });
    });

    await writeAudit(req.user!.id, "INVOICE_PAID", "Invoice", invoiceId, {
      payments: body.payments,
    }, rid);
    emitToTenant(rid, "table:updated");
    emitToTenant(rid, "order:updated", { orderId: invoice.orderId });
    const fresh = await prisma.invoice.findFirst({
      where: { id: invoiceId, restaurantId: rid },
      include: { payments: true, order: { include: { table: true, items: true } } },
    });
    res.json(fresh);
  } catch (e) {
    next(e);
  }
});

export const billingRouter = router;
