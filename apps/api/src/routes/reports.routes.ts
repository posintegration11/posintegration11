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

router.get("/overview", async (_req, res, next) => {
  try {
    const today = new Date();
    const from = new Date(today);
    from.setHours(0, 0, 0, 0);
    const to = new Date(today);
    to.setHours(23, 59, 59, 999);

    const [paidToday, paidCount, activeOrders, recentInvoices] = await Promise.all([
      prisma.invoice.aggregate({
        where: {
          createdAt: { gte: from, lte: to },
          paymentStatus: PaymentStatus.PAID,
        },
        _sum: { grandTotal: true },
      }),
      prisma.invoice.count({
        where: {
          createdAt: { gte: from, lte: to },
          paymentStatus: PaymentStatus.PAID,
        },
      }),
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
      prisma.invoice.findMany({
        where: { createdAt: { gte: from, lte: to } },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { order: { include: { table: true } } },
      }),
    ]);

    const occupiedTables = await prisma.restaurantTable.count({
      where: { status: { not: RestaurantTableStatus.FREE } },
    });

    res.json({
      salesToday: Number(paidToday._sum.grandTotal ?? 0),
      invoicesPaidToday: paidCount,
      activeOrders,
      occupiedTables,
      recentInvoices,
    });
  } catch (e) {
    next(e);
  }
});

function parseRange(req: { query: Record<string, unknown> }) {
  const today = new Date();
  let from = req.query.from ? new Date(String(req.query.from)) : new Date(today);
  let to = req.query.to ? new Date(String(req.query.to)) : new Date(today);
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
    const items = await prisma.orderItem.findMany({
      where: {
        order: { openedAt: { gte: from, lte: to } },
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
