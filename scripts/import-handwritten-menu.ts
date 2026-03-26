/**
 * Imports prisma/data/handwritten-menu-extracted.json into MenuCategory + MenuItem.
 * Half/Full (slash) items become two rows: "Name (Half)" and "Name (Full)".
 *
 * Usage (repo root):
 *   npx tsx scripts/import-handwritten-menu.ts
 *
 * Optional: MENU_IMPORT_RESTAURANT_ID=<uuid> (defaults to legacy seed tenant)
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CategoryStatus, PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEGACY = "a0000000-0000-0000-0000-000000000001";

const prisma = new PrismaClient();

type JsonItem = {
  name: string;
  price?: number;
  half?: number;
  full?: number;
};

type JsonCategory = {
  name: string;
  sortOrder: number;
  items: JsonItem[];
};

type MenuFile = { categories: JsonCategory[] };

function expandItem(i: JsonItem): { name: string; price: number }[] {
  const rows: { name: string; price: number }[] = [];
  if (i.price != null && i.price !== undefined) {
    rows.push({ name: i.name, price: i.price });
  }
  if (i.half != null) rows.push({ name: `${i.name} (Half)`, price: i.half });
  if (i.full != null) rows.push({ name: `${i.name} (Full)`, price: i.full });
  return rows;
}

async function main() {
  const restaurantId = process.env.MENU_IMPORT_RESTAURANT_ID ?? LEGACY;
  const raw = readFileSync(join(__dirname, "../prisma/data/handwritten-menu-extracted.json"), "utf8");
  const data = JSON.parse(raw) as MenuFile;

  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  if (!restaurant) {
    console.error(`Restaurant not found: ${restaurantId}`);
    process.exit(1);
  }

  let createdCats = 0;
  let createdItems = 0;

  for (const cat of data.categories) {
    let c = await prisma.menuCategory.findFirst({
      where: { restaurantId, name: cat.name },
    });
    if (!c) {
      c = await prisma.menuCategory.create({
        data: {
          restaurantId,
          name: cat.name,
          sortOrder: cat.sortOrder,
          status: CategoryStatus.ACTIVE,
        },
      });
      createdCats++;
    } else if (c.sortOrder !== cat.sortOrder) {
      await prisma.menuCategory.update({
        where: { id: c.id },
        data: { sortOrder: cat.sortOrder },
      });
    }

    for (const item of cat.items) {
      for (const row of expandItem(item)) {
        const exists = await prisma.menuItem.findFirst({
          where: { categoryId: c.id, name: row.name },
        });
        if (exists) continue;
        await prisma.menuItem.create({
          data: {
            categoryId: c.id,
            name: row.name,
            price: row.price,
            isAvailable: true,
          },
        });
        createdItems++;
      }
    }
  }

  console.log(
    `Handwritten menu import done for restaurant ${restaurantId}. Categories created: ${createdCats}, items created: ${createdItems} (existing skipped).`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    void prisma.$disconnect();
    process.exit(1);
  });
