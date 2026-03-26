import { Router } from "express";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authJwt, requireRole, requireTenantUser } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { writeAudit } from "../utils/audit.js";

const router = Router();

router.use(authJwt);
router.use(requireTenantUser);

router.get("/", async (req, res, next) => {
  try {
    const rid = req.user!.restaurantId!;
    let s = await prisma.restaurantSettings.findUnique({ where: { restaurantId: rid } });
    if (!s) {
      s = await prisma.restaurantSettings.create({
        data: { restaurantId: rid },
      });
    }
    res.json(s);
  } catch (e) {
    next(e);
  }
});

const putSchema = z.object({
  name: z.string().min(1).optional(),
  logoUrl: z.union([z.string().max(500_000), z.literal("")]).optional(),
  address: z.string().optional(),
  gstLabel: z.string().optional(),
  taxPercent: z.number().min(0).max(100).optional(),
  invoiceFooter: z.string().optional(),
  currency: z.string().min(1).optional(),
  tableCount: z.number().int().min(1).max(500).optional(),
});

const cashierSettingsKeys = ["name", "logoUrl", "address", "invoiceFooter"] as const;
const adminSettingsKeys = [
  ...cashierSettingsKeys,
  "gstLabel",
  "taxPercent",
  "currency",
  "tableCount",
] as const;

router.put("/", requireRole(UserRole.ADMIN, UserRole.CASHIER), async (req, res, next) => {
  try {
    const body = putSchema.parse(req.body);
    const rid = req.user!.restaurantId!;
    const keys =
      req.user!.role === UserRole.CASHIER ? cashierSettingsKeys : adminSettingsKeys;
    const data: Record<string, unknown> = {};
    for (const k of keys) {
      const v = body[k];
      if (v !== undefined) {
        if (k === "logoUrl") {
          data[k] = v === "" ? null : v;
        } else {
          data[k] = k === "taxPercent" ? String(v) : v;
        }
      }
    }
    if (Object.keys(data).length === 0) {
      throw new AppError(400, "No allowed fields to update");
    }
    const s = await prisma.restaurantSettings.upsert({
      where: { restaurantId: rid },
      create: { restaurantId: rid, ...(data as object) },
      update: data as object,
    });
    await writeAudit(
      req.user!.id,
      "SETTINGS_UPDATE",
      "RestaurantSettings",
      s.restaurantId,
      body as Record<string, unknown>,
      rid
    );
    res.json(s);
  } catch (e) {
    next(e);
  }
});

export const settingsRouter = router;
