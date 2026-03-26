/**
 * Loads prisma/data/handwritten-menu-extracted.json and applies categories + items
 * (Half/Full, Pizza Regular/Medium/Large expanded to separate lines).
 * Used by tenant registration, prisma seed, and optional import script.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CategoryStatus, MenuItemDiet, type PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";

const here = dirname(fileURLToPath(import.meta.url));
/** services → api → apps → repo root */
const MENU_JSON_PATH = join(here, "../../../../prisma/data/handwritten-menu-extracted.json");

export type HandwrittenJsonItem = {
  name: string;
  price?: number;
  half?: number;
  full?: number;
  regular?: number;
  medium?: number;
  large?: number;
  /** Optional per JSON row; defaults to VEG for entire row + expansions. */
  diet?: "VEG" | "NON_VEG" | "VEGAN";
};
export type HandwrittenJsonCategory = { name: string; sortOrder: number; items: HandwrittenJsonItem[] };
export type HandwrittenMenuFile = { categories: HandwrittenJsonCategory[] };

function dietFromJsonItem(i: HandwrittenJsonItem): MenuItemDiet {
  if (i.diet === "NON_VEG") return MenuItemDiet.NON_VEG;
  if (i.diet === "VEGAN") return MenuItemDiet.VEGAN;
  return MenuItemDiet.VEG;
}

export type ExpandedHandwrittenRow = { name: string; price: number; diet: MenuItemDiet };

/** Numeric prices (import CLI). */
export function expandHandwrittenItemRows(i: HandwrittenJsonItem): ExpandedHandwrittenRow[] {
  const rows: ExpandedHandwrittenRow[] = [];
  const diet = dietFromJsonItem(i);
  const hasSizes = i.regular != null || i.medium != null || i.large != null;
  if (hasSizes) {
    if (i.regular != null) rows.push({ name: `${i.name} (Regular)`, price: i.regular, diet });
    if (i.medium != null) rows.push({ name: `${i.name} (Medium)`, price: i.medium, diet });
    if (i.large != null) rows.push({ name: `${i.name} (Large)`, price: i.large, diet });
    return rows;
  }
  if (i.price != null) rows.push({ name: i.name, price: i.price, diet });
  if (i.half != null) rows.push({ name: `${i.name} (Half)`, price: i.half, diet });
  if (i.full != null) rows.push({ name: `${i.name} (Full)`, price: i.full, diet });
  return rows;
}

export function loadHandwrittenMenuFile(): HandwrittenMenuFile {
  const raw = readFileSync(MENU_JSON_PATH, "utf8");
  return JSON.parse(raw) as HandwrittenMenuFile;
}

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function applyHandwrittenMenuToRestaurant(db: DbClient, restaurantId: string): Promise<void> {
  const handwritten = loadHandwrittenMenuFile();

  for (const cat of handwritten.categories) {
    let row = await db.menuCategory.findFirst({
      where: { name: cat.name, restaurantId },
    });
    row =
      row ??
      (await db.menuCategory.create({
        data: {
          restaurantId,
          name: cat.name,
          sortOrder: cat.sortOrder,
          status: CategoryStatus.ACTIVE,
        },
      }));
    if (row.sortOrder !== cat.sortOrder) {
      await db.menuCategory.update({
        where: { id: row.id },
        data: { sortOrder: cat.sortOrder },
      });
    }

    for (const item of cat.items) {
      for (const expanded of expandHandwrittenItemRows(item)) {
        const exists = await db.menuItem.findFirst({
          where: { categoryId: row.id, name: expanded.name },
        });
        if (exists) continue;
        await db.menuItem.create({
          data: {
            categoryId: row.id,
            name: expanded.name,
            price: expanded.price.toFixed(2),
            diet: expanded.diet,
            isAvailable: true,
          },
        });
      }
    }
  }
}
