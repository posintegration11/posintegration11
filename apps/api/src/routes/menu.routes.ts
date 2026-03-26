import { Router } from "express";
import { CategoryStatus, UserRole, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authJwt, requireRole, requireTenantUser } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { writeAudit } from "../utils/audit.js";

const router = Router();

const ARCHIVE_CATEGORY_NAME = "Archived (order history)";

async function getOrCreateArchiveCategory(tx: Prisma.TransactionClient, restaurantId: string) {
  const existing = await tx.menuCategory.findFirst({
    where: { restaurantId, name: ARCHIVE_CATEGORY_NAME },
  });
  if (existing) return existing.id;
  const row = await tx.menuCategory.create({
    data: {
      restaurantId,
      name: ARCHIVE_CATEGORY_NAME,
      sortOrder: 9999,
      status: CategoryStatus.INACTIVE,
    },
  });
  return row.id;
}

router.use(authJwt);
router.use(requireTenantUser);

router.get("/categories/all", requireRole(UserRole.ADMIN), async (req, res, next) => {
  try {
    const rid = req.user!.restaurantId!;
    const rows = await prisma.menuCategory.findMany({
      where: { restaurantId: rid },
      orderBy: { sortOrder: "asc" },
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get("/categories", async (req, res, next) => {
  try {
    const rid = req.user!.restaurantId!;
    const rows = await prisma.menuCategory.findMany({
      where: { status: CategoryStatus.ACTIVE, restaurantId: rid },
      orderBy: { sortOrder: "asc" },
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get("/items", async (req, res, next) => {
  try {
    const rid = req.user!.restaurantId!;
    const categoryId = req.query.categoryId as string | undefined;
    const q = (req.query.q as string | undefined)?.trim();
    const rows = await prisma.menuItem.findMany({
      where: {
        isAvailable: true,
        category: { restaurantId: rid },
        ...(categoryId ? { categoryId } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
      include: { category: true },
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

const catCreate = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().optional(),
  status: z.nativeEnum(CategoryStatus).optional(),
});

router.post("/categories", requireRole(UserRole.ADMIN), async (req, res, next) => {
  try {
    const body = catCreate.parse(req.body);
    const rid = req.user!.restaurantId!;
    const row = await prisma.menuCategory.create({
      data: {
        restaurantId: rid,
        name: body.name,
        sortOrder: body.sortOrder ?? 0,
        status: body.status ?? CategoryStatus.ACTIVE,
      },
    });
    await writeAudit(req.user!.id, "MENU_CATEGORY_CREATE", "MenuCategory", row.id, { name: row.name }, rid);
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

router.put("/categories/:id", requireRole(UserRole.ADMIN), async (req, res, next) => {
  try {
    const id = req.params.id;
    const rid = req.user!.restaurantId!;
    const body = catCreate.partial().parse(req.body);
    const existing = await prisma.menuCategory.findFirst({ where: { id, restaurantId: rid } });
    if (!existing) {
      throw new AppError(404, "Category not found");
    }
    const row = await prisma.menuCategory.update({ where: { id }, data: body });
    await writeAudit(req.user!.id, "MENU_CATEGORY_UPDATE", "MenuCategory", id, body as Record<string, unknown>, rid);
    res.json(row);
  } catch (e) {
    next(e);
  }
});

router.delete("/categories/:id", requireRole(UserRole.ADMIN), async (req, res, next) => {
  try {
    const id = req.params.id;
    const rid = req.user!.restaurantId!;
    const existing = await prisma.menuCategory.findFirst({ where: { id, restaurantId: rid } });
    if (!existing) {
      throw new AppError(404, "Category not found");
    }
    if (existing.name === ARCHIVE_CATEGORY_NAME) {
      throw new AppError(400, "Cannot delete the system archive category");
    }

    await prisma.$transaction(async (tx) => {
      const archiveCatId = await getOrCreateArchiveCategory(tx, rid);
      if (archiveCatId === id) {
        throw new AppError(400, "Invalid category");
      }

      const items = await tx.menuItem.findMany({ where: { categoryId: id }, select: { id: true } });
      for (const it of items) {
        const used = await tx.orderItem.count({ where: { menuItemId: it.id } });
        if (used > 0) {
          await tx.menuItem.update({
            where: { id: it.id },
            data: { categoryId: archiveCatId, isAvailable: false },
          });
        } else {
          await tx.menuItem.delete({ where: { id: it.id } });
        }
      }

      await tx.menuCategory.delete({ where: { id } });
    });

    await writeAudit(req.user!.id, "MENU_CATEGORY_DELETE", "MenuCategory", id, { name: existing.name }, rid);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

const itemCreate = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.union([z.number(), z.string()]),
  taxRate: z.union([z.number(), z.string()]).optional(),
  isAvailable: z.boolean().optional(),
});

router.post("/items", requireRole(UserRole.ADMIN), async (req, res, next) => {
  try {
    const body = itemCreate.parse(req.body);
    const rid = req.user!.restaurantId!;
    const cat = await prisma.menuCategory.findFirst({
      where: { id: body.categoryId, restaurantId: rid },
    });
    if (!cat) {
      throw new AppError(404, "Category not found");
    }
    const row = await prisma.menuItem.create({
      data: {
        categoryId: body.categoryId,
        name: body.name,
        description: body.description,
        price: String(body.price),
        taxRate: body.taxRate != null ? String(body.taxRate) : null,
        isAvailable: body.isAvailable ?? true,
      },
    });
    await writeAudit(req.user!.id, "MENU_ITEM_CREATE", "MenuItem", row.id, { name: row.name }, rid);
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

router.put("/items/:id", requireRole(UserRole.ADMIN), async (req, res, next) => {
  try {
    const id = req.params.id;
    const rid = req.user!.restaurantId!;
    const body = itemCreate
      .partial()
      .omit({ categoryId: true })
      .extend({ categoryId: z.string().uuid().optional() })
      .parse(req.body);
    const existing = await prisma.menuItem.findFirst({
      where: { id, category: { restaurantId: rid } },
    });
    if (!existing) {
      throw new AppError(404, "Menu item not found");
    }
    if (body.categoryId) {
      const cat = await prisma.menuCategory.findFirst({
        where: { id: body.categoryId, restaurantId: rid },
      });
      if (!cat) {
        throw new AppError(404, "Category not found");
      }
    }
    const data: Record<string, unknown> = { ...body };
    if (body.price != null) data.price = String(body.price);
    if (body.taxRate !== undefined) data.taxRate = body.taxRate != null ? String(body.taxRate) : null;
    const row = await prisma.menuItem.update({ where: { id }, data: data as never });
    await writeAudit(req.user!.id, "MENU_ITEM_UPDATE", "MenuItem", id, data as Record<string, unknown>, rid);
    res.json(row);
  } catch (e) {
    next(e);
  }
});

router.delete("/items/:id", requireRole(UserRole.ADMIN), async (req, res, next) => {
  try {
    const id = req.params.id;
    const rid = req.user!.restaurantId!;
    const existing = await prisma.menuItem.findFirst({
      where: { id, category: { restaurantId: rid } },
    });
    if (!existing) {
      throw new AppError(404, "Menu item not found");
    }

    const usedOnOrders = await prisma.orderItem.count({ where: { menuItemId: id } });
    if (usedOnOrders > 0) {
      await prisma.menuItem.update({
        where: { id },
        data: { isAvailable: false },
      });
      await writeAudit(req.user!.id, "MENU_ITEM_ARCHIVE", "MenuItem", id, { orderLineCount: usedOnOrders }, rid);
      return res.json({
        archived: true,
        message:
          "This item was used on past orders, so it was hidden from the menu instead of being deleted. Old bills and reports are unchanged.",
      });
    }

    await prisma.menuItem.delete({ where: { id } });
    await writeAudit(req.user!.id, "MENU_ITEM_DELETE", "MenuItem", id, {}, rid);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

export const menuRouter = router;
