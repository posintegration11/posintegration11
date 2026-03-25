import { Router } from "express";
import { CategoryStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authJwt, requireRole } from "../middleware/auth.js";
import { writeAudit } from "../utils/audit.js";

const router = Router();

router.use(authJwt);

router.get("/categories/all", requireRole(UserRole.ADMIN), async (_req, res, next) => {
  try {
    const rows = await prisma.menuCategory.findMany({ orderBy: { sortOrder: "asc" } });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get("/categories", async (_req, res, next) => {
  try {
    const rows = await prisma.menuCategory.findMany({
      where: { status: CategoryStatus.ACTIVE },
      orderBy: { sortOrder: "asc" },
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get("/items", async (req, res, next) => {
  try {
    const categoryId = req.query.categoryId as string | undefined;
    const q = (req.query.q as string | undefined)?.trim();
    const rows = await prisma.menuItem.findMany({
      where: {
        isAvailable: true,
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
    const row = await prisma.menuCategory.create({
      data: {
        name: body.name,
        sortOrder: body.sortOrder ?? 0,
        status: body.status ?? CategoryStatus.ACTIVE,
      },
    });
    await writeAudit(req.user!.id, "MENU_CATEGORY_CREATE", "MenuCategory", row.id, { name: row.name });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

router.put("/categories/:id", requireRole(UserRole.ADMIN), async (req, res, next) => {
  try {
    const id = req.params.id;
    const body = catCreate.partial().parse(req.body);
    const row = await prisma.menuCategory.update({ where: { id }, data: body });
    await writeAudit(req.user!.id, "MENU_CATEGORY_UPDATE", "MenuCategory", id, body as Record<string, unknown>);
    res.json(row);
  } catch (e) {
    next(e);
  }
});

router.delete("/categories/:id", requireRole(UserRole.ADMIN), async (req, res, next) => {
  try {
    const id = req.params.id;
    await prisma.menuCategory.delete({ where: { id } });
    await writeAudit(req.user!.id, "MENU_CATEGORY_DELETE", "MenuCategory", id, {});
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
    await writeAudit(req.user!.id, "MENU_ITEM_CREATE", "MenuItem", row.id, { name: row.name });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

router.put("/items/:id", requireRole(UserRole.ADMIN), async (req, res, next) => {
  try {
    const id = req.params.id;
    const body = itemCreate.partial().omit({ categoryId: true }).extend({ categoryId: z.string().uuid().optional() }).parse(req.body);
    const data: Record<string, unknown> = { ...body };
    if (body.price != null) data.price = String(body.price);
    if (body.taxRate !== undefined) data.taxRate = body.taxRate != null ? String(body.taxRate) : null;
    const row = await prisma.menuItem.update({ where: { id }, data: data as never });
    await writeAudit(req.user!.id, "MENU_ITEM_UPDATE", "MenuItem", id, data as Record<string, unknown>);
    res.json(row);
  } catch (e) {
    next(e);
  }
});

router.delete("/items/:id", requireRole(UserRole.ADMIN), async (req, res, next) => {
  try {
    const id = req.params.id;
    await prisma.menuItem.delete({ where: { id } });
    await writeAudit(req.user!.id, "MENU_ITEM_DELETE", "MenuItem", id, {});
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

export const menuRouter = router;
