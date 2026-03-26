import { OrderItemStatus, OrderStatus } from "@prisma/client";
import { prisma } from "../prisma.js";
import { persistOrderTotals } from "./orderTotals.js";

const TERMINAL: OrderStatus[] = [OrderStatus.PAID, OrderStatus.CLOSED, OrderStatus.CANCELLED];

/**
 * Removes invalid lines on open orders:
 * - MenuItem deleted → FK sets menuItemId null; snapshot name can still show (e.g. old "demo1").
 * - menuItemId points at a row that no longer exists for this tenant (inconsistent data).
 */
export async function repairOrphanOrderLines(orderId: string, restaurantId: string): Promise<boolean> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
    include: { items: true },
  });
  if (!order || TERMINAL.includes(order.status)) return false;

  const candidates = order.items.filter((i) => i.status !== OrderItemStatus.CANCELLED);
  if (candidates.length === 0) return false;

  const withMenuId = candidates.filter((i): i is (typeof candidates)[number] & { menuItemId: string } =>
    Boolean(i.menuItemId),
  );
  const menuIds = [...new Set(withMenuId.map((i) => i.menuItemId))];
  const existingRows =
    menuIds.length === 0
      ? []
      : await prisma.menuItem.findMany({
          where: { id: { in: menuIds }, category: { restaurantId } },
          select: { id: true },
        });
  const existingSet = new Set(existingRows.map((r) => r.id));

  const orphans = candidates.filter(
    (i) => i.menuItemId == null || !existingSet.has(i.menuItemId),
  );
  if (orphans.length === 0) return false;

  await prisma.$transaction(
    orphans.map((o) =>
      prisma.orderItem.update({
        where: { id: o.id },
        data: { status: OrderItemStatus.CANCELLED, lineTotal: "0" },
      }),
    ),
  );
  await persistOrderTotals(orderId);
  return true;
}
