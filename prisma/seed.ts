import {
  PrismaClient,
  RestaurantStatus,
  RestaurantTableStatus,
  UserRole,
  UserStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { applyHandwrittenMenuToRestaurant } from "../apps/api/src/services/handwrittenMenuSeed.js";

const prisma = new PrismaClient();

const LEGACY_RESTAURANT_ID = "a0000000-0000-0000-0000-000000000001";

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

  await applyHandwrittenMenuToRestaurant(prisma, LEGACY_RESTAURANT_ID);

  console.log(
    "Seed completed.\n  Menu: prisma/data/handwritten-menu-extracted.json (Half/Full & Pizza Regular/Medium/Large = separate lines)\n  Tenant: admin@pos.local / password123 (same for staff)\n  Platform: " +
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
