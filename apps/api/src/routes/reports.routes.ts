import { Router } from "express";
import {
  OrderItemStatus,
  OrderStatus,
  PaymentStatus,
  RestaurantTableStatus,
  UserRole,
} from "@prisma/client";
import { prisma } from "../prisma.js";
import { authJwt, requireRole } from "../middleware/auth.js";

const router = Router();

router.use(authJwt);
router.use(requireRole(UserRole.ADMIN, UserRole.CASHIER));

router.get("/overview", async (req, res, next) => {
  try {
    const { from, to } = parseRange(req);

    const paymentTotals = prisma.payment.aggregate({
      where: { paidAt: { gte: from, lte: to } },
      _sum: { amount: true },
    });

    const settledInvoiceGroups = prisma.payment.groupBy({
      by: ["invoiceId"],
      where: { paidAt: { gte: from, lte: to } },
    });

    const [paySum, invoiceIdGroups, activeOrders, paymentRows, busyDineIn] = await Promise.all([
      paymentTotals,
      settledInvoiceGroups,
      prisma.order.count({
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
      }),
      prisma.payment.findMany({
        where: { paidAt: { gte: from, lte: to } },
        orderBy: { paidAt: "desc" },
        take: 48,
        include: {
          invoice: {
            include: { order: { include: { table: true } } },
          },
        },
      }),
      prisma.restaurantTable.count({
        where: {
          isWalkIn: false,
          status: { not: RestaurantTableStatus.FREE },
        },
      }),
    ]);

    const seenInvoice = new Set<string>();
    const recentInvoices: unknown[] = [];
    for (const p of paymentRows) {
      const inv = p.invoice;
      if (!inv || inv.paymentStatus !== PaymentStatus.PAID) continue;
      if (seenInvoice.has(inv.id)) continue;
      seenInvoice.add(inv.id);
      recentInvoices.push({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        subtotal: String(inv.subtotal),
        taxTotal: String(inv.taxTotal),
        discountTotal: String(inv.discountTotal),
        grandTotal: String(inv.grandTotal),
        paymentStatus: inv.paymentStatus,
        paymentMode: inv.paymentMode,
        createdAt: inv.createdAt.toISOString(),
        settledAt: p.paidAt.toISOString(),
        order: {
          id: inv.order.id,
          table: {
            tableNumber: inv.order.table.tableNumber,
            name: inv.order.table.name,
            isWalkIn: inv.order.table.isWalkIn,
          },
        },
      });
      if (recentInvoices.length >= 8) break;
    }

    res.json({
      salesToday: Number(paySum._sum.amount ?? 0),
      invoicesPaidToday: invoiceIdGroups.length,
      activeOrders,
      occupiedTables: busyDineIn,
      recentInvoices,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * Date range for reports. If `from`/`to` query params are full ISO datetimes (browser local day),
 * uses them as-is. Otherwise falls back to calendar start/end of those dates in server local time.
 */
function parseRange(req: { query: Record<string, unknown> }) {
  const today = new Date();
  const fromQ = req.query.from ? String(req.query.from) : "";
  const toQ = req.query.to ? String(req.query.to) : "";
  if (fromQ && toQ) {
    const fromIso = new Date(fromQ);
    const toIso = new Date(toQ);
    if (!Number.isNaN(fromIso.getTime()) && !Number.isNaN(toIso.getTime())) {
      if (/T/i.test(fromQ) && /T/i.test(toQ)) {
        return { from: fromIso, to: toIso };
      }
    }
  }

  let from = fromQ ? new Date(fromQ) : new Date(today);
  let to = toQ ? new Date(toQ) : new Date(today);
  if (Number.isNaN(from.getTime())) from = new Date(today);
  if (Number.isNaN(to.getTime())) to = new Date(today);
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

router.get("/daily-sales", async (req, res, next) => {
  try {
    const { from, to } = parseRange(req);
    const invoices = await prisma.invoice.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        paymentStatus: PaymentStatus.PAID,
      },
    });
    const total = invoices.reduce((a, i) => a + Number(i.grandTotal), 0);
    res.json({ from, to, invoiceCount: invoices.length, totalSales: total, invoices });
  } catch (e) {
    next(e);
  }
});

router.get("/orders-summary", async (req, res, next) => {
  try {
    const { from, to } = parseRange(req);
    const orders = await prisma.order.findMany({
      where: { openedAt: { gte: from, lte: to } },
    });
    const byStatus = orders.reduce<Record<string, number>>((acc, o) => {
      acc[o.status] = (acc[o.status] ?? 0) + 1;
      return acc;
    }, {});
    res.json({ from, to, totalOrders: orders.length, byStatus });
  } catch (e) {
    next(e);
  }
});

router.get("/payment-summary", async (req, res, next) => {
  try {
    const { from, to } = parseRange(req);
    const payments = await prisma.payment.findMany({
      where: { paidAt: { gte: from, lte: to } },
      include: { invoice: true },
    });
    const byMode = payments.reduce<Record<string, number>>((acc, p) => {
      const k = p.mode;
      acc[k] = (acc[k] ?? 0) + Number(p.amount);
      return acc;
    }, {});
    res.json({ from, to, byMode, paymentCount: payments.length });
  } catch (e) {
    next(e);
  }
});

router.get("/top-items", async (req, res, next) => {
  try {
    const { from, to } = parseRange(req);
    const payments = await prisma.payment.findMany({
      where: { paidAt: { gte: from, lte: to } },
      select: { invoiceId: true },
    });
    const invoiceIds = [...new Set(payments.map((p) => p.invoiceId))];
    if (invoiceIds.length === 0) {
      res.json({ from, to, items: [] });
      return;
    }
    const invoices = await prisma.invoice.findMany({
      where: { id: { in: invoiceIds } },
      select: { orderId: true },
    });
    const orderIds = [...new Set(invoices.map((i) => i.orderId))];
    const items = await prisma.orderItem.findMany({
      where: {
        orderId: { in: orderIds },
        status: { not: OrderItemStatus.CANCELLED },
      },
    });
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const it of items) {
      const key = it.itemNameSnapshot;
      const cur = map.get(key) ?? { name: key, qty: 0, revenue: 0 };
      cur.qty += it.quantity;
      cur.revenue += Number(it.lineTotal);
      map.set(key, cur);
    }
    const ranked = [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 20);
    res.json({ from, to, items: ranked });
  } catch (e) {
    next(e);
  }
});

router.get("/table-stats", async (req, res, next) => {
  try {
    const { from, to } = parseRange(req);
    const orders = await prisma.order.findMany({
      where: { openedAt: { gte: from, lte: to } },
      include: { table: true },
    });
    const byTable = orders.reduce<Record<string, number>>((acc, o) => {
      const label = `Table ${o.table.tableNumber}`;
      acc[label] = (acc[label] ?? 0) + 1;
      return acc;
    }, {});
    res.json({ from, to, byTable });
  } catch (e) {
    next(e);
  }
});

router.get("/cancellations", async (req, res, next) => {
  try {
    const { from, to } = parseRange(req);
    const cancelledItems = await prisma.orderItem.findMany({
      where: {
        status: OrderItemStatus.CANCELLED,
        order: { openedAt: { gte: from, lte: to } },
      },
      include: { order: { include: { table: true } } },
    });
    const cancelledOrders = await prisma.order.findMany({
      where: {
        status: OrderStatus.CANCELLED,
        openedAt: { gte: from, lte: to },
      },
    });
    res.json({
      from,
      to,
      cancelledItemCount: cancelledItems.length,
      cancelledItems,
      cancelledOrderCount: cancelledOrders.length,
      cancelledOrders,
    });
  } catch (e) {
    next(e);
  }
});

export const reportsRouter = router;
