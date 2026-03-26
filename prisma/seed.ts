import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PrismaClient,
  RestaurantStatus,
  RestaurantTableStatus,
  UserRole,
  UserStatus,
  CategoryStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const LEGACY_RESTAURANT_ID = "a0000000-0000-0000-0000-000000000001";

type HandwrittenJsonItem = { name: string; price?: number; half?: number; full?: number };
type HandwrittenJsonCategory = { name: string; sortOrder: number; items: HandwrittenJsonItem[] };
type HandwrittenMenuFile = { categories: HandwrittenJsonCategory[] };

function expandHandwrittenItem(i: HandwrittenJsonItem): { name: string; price: string }[] {
  const rows: { name: string; price: string }[] = [];
  if (i.price != null) rows.push({ name: i.name, price: Number(i.price).toFixed(2) });
  if (i.half != null) rows.push({ name: `${i.name} (Half)`, price: Number(i.half).toFixed(2) });
  if (i.full != null) rows.push({ name: `${i.name} (Full)`, price: Number(i.full).toFixed(2) });
  return rows;
}

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  await prisma.restaurant.upsert({
    where: { id: LEGACY_RESTAURANT_ID },
    create: {
      id: LEGACY_RESTAURANT_ID,
      name: "Grand Hotel Restaurant",
      address: "123 Main Street, City",
      status: RestaurantStatus.ACTIVE,
    },
    update: {
      status: RestaurantStatus.ACTIVE,
    },
  });

  await prisma.restaurantSettings.upsert({
    where: { restaurantId: LEGACY_RESTAURANT_ID },
    create: {
      restaurantId: LEGACY_RESTAURANT_ID,
      name: "Grand Hotel Restaurant",
      address: "123 Main Street, City",
      gstLabel: "GST",
      taxPercent: 5,
      invoiceFooter: "Thank you for dining with us!",
      currency: "INR",
      tableCount: 10,
    },
    update: {},
  });

  const users = [
    { name: "Admin User", email: "admin@pos.local", role: UserRole.ADMIN },
    { name: "Cashier One", email: "cashier@pos.local", role: UserRole.CASHIER },
    { name: "Waiter One", email: "waiter@pos.local", role: UserRole.WAITER },
    { name: "Kitchen One", email: "kitchen@pos.local", role: UserRole.KITCHEN },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      create: {
        name: u.name,
        email: u.email,
        passwordHash,
        role: u.role,
        status: UserStatus.ACTIVE,
        restaurantId: LEGACY_RESTAURANT_ID,
      },
      update: { passwordHash, role: u.role, restaurantId: LEGACY_RESTAURANT_ID },
    });
  }

  const platformEmail = (process.env.PLATFORM_ADMIN_EMAIL ?? "platform@pos.local").toLowerCase();
  await prisma.user.upsert({
    where: { email: platformEmail },
    create: {
      name: "Platform Admin",
      email: platformEmail,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      restaurantId: null,
    },
    update: {
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      restaurantId: null,
      status: UserStatus.ACTIVE,
    },
  });

  await prisma.restaurantTable.upsert({
    where: {
      restaurantId_tableNumber: { restaurantId: LEGACY_RESTAURANT_ID, tableNumber: 0 },
    },
    create: {
      restaurantId: LEGACY_RESTAURANT_ID,
      tableNumber: 0,
      name: "Walk-in",
      capacity: null,
      isWalkIn: true,
      status: RestaurantTableStatus.FREE,
    },
    update: { name: "Walk-in", isWalkIn: true },
  });

  for (let n = 1; n <= 10; n++) {
    await prisma.restaurantTable.upsert({
      where: {
        restaurantId_tableNumber: { restaurantId: LEGACY_RESTAURANT_ID, tableNumber: n },
      },
      create: {
        restaurantId: LEGACY_RESTAURANT_ID,
        tableNumber: n,
        name: `Table ${n}`,
        capacity: 4,
        isWalkIn: false,
        status: RestaurantTableStatus.FREE,
      },
      update: { isWalkIn: false },
    });
  }

  const menuPath = join(process.cwd(), "prisma/data/handwritten-menu-extracted.json");
  const handwritten = JSON.parse(readFileSync(menuPath, "utf8")) as HandwrittenMenuFile;

  for (const cat of handwritten.categories) {
    let row = await prisma.menuCategory.findFirst({
      where: { name: cat.name, restaurantId: LEGACY_RESTAURANT_ID },
    });
    row =
      row ??
      (await prisma.menuCategory.create({
        data: {
          restaurantId: LEGACY_RESTAURANT_ID,
          name: cat.name,
          sortOrder: cat.sortOrder,
          status: CategoryStatus.ACTIVE,
        },
      }));
    if (row.sortOrder !== cat.sortOrder) {
      await prisma.menuCategory.update({
        where: { id: row.id },
        data: { sortOrder: cat.sortOrder },
      });
    }

    for (const item of cat.items) {
      for (const expanded of expandHandwrittenItem(item)) {
        const exists = await prisma.menuItem.findFirst({
          where: { categoryId: row.id, name: expanded.name },
        });
        if (exists) continue;
        await prisma.menuItem.create({
          data: {
            categoryId: row.id,
            name: expanded.name,
            price: expanded.price,
            isAvailable: true,
          },
        });
      }
    }
  }

  console.log(
    "Seed completed.\n  Menu: prisma/data/handwritten-menu-extracted.json (Half/Full = separate lines)\n  Tenant: admin@pos.local / password123 (same for staff)\n  Platform: " +
      platformEmail +
      " / password123",
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
