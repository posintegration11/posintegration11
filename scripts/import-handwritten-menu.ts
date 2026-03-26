/**
 * Imports prisma/data/handwritten-menu-extracted.json into MenuCategory + MenuItem.
 * Half/Full and Pizza sizes are expanded (same rules as seed / new-tenant registration).
 *
 * Usage (repo root):
 *   npx tsx scripts/import-handwritten-menu.ts
 *
 * Optional: MENU_IMPORT_RESTAURANT_ID=<uuid> (defaults to legacy seed tenant)
 */
import { PrismaClient } from "@prisma/client";
import { applyHandwrittenMenuToRestaurant } from "../apps/api/src/services/handwrittenMenuSeed.js";

const LEGACY = "a0000000-0000-0000-0000-000000000001";

const prisma = new PrismaClient();

async function main() {
  const restaurantId = process.env.MENU_IMPORT_RESTAURANT_ID ?? LEGACY;
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  if (!restaurant) {
    console.error(`Restaurant not found: ${restaurantId}`);
    process.exit(1);
  }

  await applyHandwrittenMenuToRestaurant(prisma, restaurantId);
  console.log(
    `Handwritten menu applied for restaurant ${restaurantId} (existing category/item names skipped).`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    void prisma.$disconnect();
    process.exit(1);
  });
