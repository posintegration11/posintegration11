import { OrderItemStatus } from "@prisma/client";
import { prisma } from "../prisma.js";

export async function persistOrderTotals(
  orderId: string,
  discountOverride?: number
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) {
    return null;
  }

  const settings = await prisma.restaurantSettings.findUnique({ where: { id: "default" } });
  const taxPercent = settings ? Number(settings.taxPercent) : 0;

  let subtotal = 0;
  for (const it of order.items) {
    if (it.status !== OrderItemStatus.CANCELLED) {
      subtotal += Number(it.lineTotal);
    }
  }

  const discountTotal =
    discountOverride !== undefined ? discountOverride : Number(order.discountTotal);
  const afterDiscount = Math.max(0, subtotal - discountTotal);
  const taxTotal = (afterDiscount * taxPercent) / 100;
  const grandTotal = afterDiscount + taxTotal;

  return prisma.order.update({
    where: { id: orderId },
    data: {
      subtotal: String(subtotal),
      discountTotal: String(discountTotal),
      taxTotal: String(taxTotal),
      grandTotal: String(grandTotal),
    },
  });
}
