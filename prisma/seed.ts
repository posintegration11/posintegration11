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

  const categories = [
    { name: "Starters", sortOrder: 0 },
    { name: "Main Course", sortOrder: 1 },
    { name: "Beverages", sortOrder: 2 },
    { name: "Desserts", sortOrder: 3 },
  ];

  const catRecords: { id: string; name: string }[] = [];
  for (const c of categories) {
    const existing = await prisma.menuCategory.findFirst({
      where: { name: c.name, restaurantId: LEGACY_RESTAURANT_ID },
    });
    const row =
      existing ??
      (await prisma.menuCategory.create({
        data: {
          restaurantId: LEGACY_RESTAURANT_ID,
          name: c.name,
          sortOrder: c.sortOrder,
          status: CategoryStatus.ACTIVE,
        },
      }));
    catRecords.push({ id: row.id, name: row.name });
  }

  const byName = Object.fromEntries(catRecords.map((x) => [x.name, x.id]));

  const items: { cat: string; name: string; price: string; desc?: string }[] = [
    { cat: "Starters", name: "Spring Rolls", price: "120.00", desc: "Crispy veg rolls" },
    { cat: "Starters", name: "Soup of the Day", price: "90.00" },
    { cat: "Main Course", name: "Grilled Chicken", price: "350.00" },
    { cat: "Main Course", name: "Paneer Tikka", price: "280.00" },
    { cat: "Main Course", name: "Fish Curry", price: "320.00" },
    { cat: "Beverages", name: "Fresh Lime Soda", price: "60.00" },
    { cat: "Beverages", name: "Masala Chai", price: "40.00" },
    { cat: "Beverages", name: "Cold Coffee", price: "110.00" },
    { cat: "Desserts", name: "Ice Cream", price: "80.00" },
    { cat: "Desserts", name: "Gulab Jamun", price: "70.00" },
  ];

  for (const it of items) {
    const categoryId = byName[it.cat];
    const found = await prisma.menuItem.findFirst({
      where: { categoryId, name: it.name },
    });
    if (!found) {
      await prisma.menuItem.create({
        data: {
          categoryId,
          name: it.name,
          description: it.desc ?? null,
          price: it.price,
          isAvailable: true,
        },
      });
    }
  }

  console.log(
    "Seed completed.\n  Tenant: admin@pos.local / password123 (same for staff)\n  Platform: " +
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
