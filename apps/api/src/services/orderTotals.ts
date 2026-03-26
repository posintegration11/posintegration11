import { OrderItemStatus, OrderStatus } from "@prisma/client";
import { prisma } from "../prisma.js";
import { emitToTenant } from "../realtime.js";

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

  const settings = await prisma.restaurantSettings.findUnique({
    where: { restaurantId: order.restaurantId },
  });
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

  /** Nothing left to bill / send — avoid stuck "ready for billing" with an empty cart. */
  const clearKitchenOrBilling =
    subtotal <= 0 &&
    (order.status === OrderStatus.READY_FOR_BILLING || order.status === OrderStatus.KOT_SENT);

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      subtotal: String(subtotal),
      discountTotal: String(discountTotal),
      taxTotal: String(taxTotal),
      grandTotal: String(grandTotal),
      ...(clearKitchenOrBilling ? { status: OrderStatus.RUNNING } : {}),
    },
  });

  if (clearKitchenOrBilling && order.restaurantId) {
    emitToTenant(order.restaurantId, "order:updated", { orderId });
    emitToTenant(order.restaurantId, "table:updated");
  }

  return updated;
}
