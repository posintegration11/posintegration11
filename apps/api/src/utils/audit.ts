import { prisma } from "../prisma.js";

export async function writeAudit(
  userId: string | undefined,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata?: Record<string, unknown>,
  restaurantId?: string | null
) {
  await prisma.auditLog.create({
    data: {
      userId: userId ?? null,
      restaurantId: restaurantId ?? null,
      action,
      entityType,
      entityId,
      metadata: metadata as object | undefined,
    },
  });
}
