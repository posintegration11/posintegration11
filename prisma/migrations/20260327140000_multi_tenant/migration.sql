-- Multi-tenant: restaurants, per-tenant FKs, verification + demo tables.
-- Legacy tenant id (stable for seeds / local dev backfill)
-- a0000000-0000-0000-0000-000000000001

-- CreateEnum
CREATE TYPE "RestaurantStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED');

-- Extend UserRole (append; Prisma maps by name, not ordinal)
ALTER TYPE "UserRole" ADD VALUE 'SUPER_ADMIN';

-- CreateTable
CREATE TABLE "restaurants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "status" "RestaurantStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "slug" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "restaurants_slug_key" ON "restaurants"("slug");

INSERT INTO "restaurants" ("id", "name", "address", "status", "slug", "created_at", "updated_at")
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Legacy Restaurant',
    '',
    'ACTIVE',
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "email_verification_tokens_user_id_idx" ON "email_verification_tokens"("user_id");

-- CreateTable
CREATE TABLE "demo_requests" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "restaurant_name" TEXT,
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demo_requests_pkey" PRIMARY KEY ("id")
);

-- Users → restaurant (nullable for SUPER_ADMIN)
ALTER TABLE "users" ADD COLUMN "restaurant_id" TEXT;

UPDATE "users" SET "restaurant_id" = 'a0000000-0000-0000-0000-000000000001' WHERE "restaurant_id" IS NULL;

CREATE INDEX "users_restaurant_id_idx" ON "users"("restaurant_id");

ALTER TABLE "users" ADD CONSTRAINT "users_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tables: composite unique (restaurant_id, table_number)
ALTER TABLE "restaurant_tables" ADD COLUMN "restaurant_id" TEXT;

UPDATE "restaurant_tables" SET "restaurant_id" = 'a0000000-0000-0000-0000-000000000001' WHERE "restaurant_id" IS NULL;

ALTER TABLE "restaurant_tables" ALTER COLUMN "restaurant_id" SET NOT NULL;

DROP INDEX IF EXISTS "restaurant_tables_table_number_key";

CREATE UNIQUE INDEX "restaurant_tables_restaurant_id_table_number_key" ON "restaurant_tables"("restaurant_id", "table_number");

CREATE INDEX "restaurant_tables_restaurant_id_idx" ON "restaurant_tables"("restaurant_id");

ALTER TABLE "restaurant_tables" ADD CONSTRAINT "restaurant_tables_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Menu categories per tenant
ALTER TABLE "menu_categories" ADD COLUMN "restaurant_id" TEXT;

UPDATE "menu_categories" SET "restaurant_id" = 'a0000000-0000-0000-0000-000000000001' WHERE "restaurant_id" IS NULL;

ALTER TABLE "menu_categories" ALTER COLUMN "restaurant_id" SET NOT NULL;

CREATE INDEX "menu_categories_restaurant_id_idx" ON "menu_categories"("restaurant_id");

ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Orders: restaurant_id + composite unique order number
ALTER TABLE "orders" ADD COLUMN "restaurant_id" TEXT;

UPDATE "orders" AS o
SET "restaurant_id" = t."restaurant_id"
FROM "restaurant_tables" AS t
WHERE o."table_id" = t."id";

ALTER TABLE "orders" ALTER COLUMN "restaurant_id" SET NOT NULL;

DROP INDEX IF EXISTS "orders_order_number_key";

CREATE UNIQUE INDEX "orders_restaurant_id_order_number_key" ON "orders"("restaurant_id", "order_number");

CREATE INDEX "orders_restaurant_id_status_idx" ON "orders"("restaurant_id", "status");

ALTER TABLE "orders" ADD CONSTRAINT "orders_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Invoices: restaurant scope + composite invoice number
ALTER TABLE "invoices" ADD COLUMN "restaurant_id" TEXT;

UPDATE "invoices" AS i
SET "restaurant_id" = o."restaurant_id"
FROM "orders" AS o
WHERE i."order_id" = o."id";

ALTER TABLE "invoices" ALTER COLUMN "restaurant_id" SET NOT NULL;

DROP INDEX IF EXISTS "invoices_invoice_number_key";

CREATE UNIQUE INDEX "invoices_restaurant_id_invoice_number_key" ON "invoices"("restaurant_id", "invoice_number");

CREATE INDEX "invoices_restaurant_id_idx" ON "invoices"("restaurant_id");

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Audit logs: optional tenant
ALTER TABLE "audit_logs" ADD COLUMN "restaurant_id" TEXT;

UPDATE "audit_logs" AS a
SET "restaurant_id" = u."restaurant_id"
FROM "users" AS u
WHERE a."user_id" = u."id";

CREATE INDEX "audit_logs_restaurant_id_idx" ON "audit_logs"("restaurant_id");

-- Restaurant settings: PK = restaurant_id (replace legacy "default" id)
ALTER TABLE "restaurant_settings" ADD COLUMN "restaurant_id" TEXT;

UPDATE "restaurant_settings" SET "restaurant_id" = 'a0000000-0000-0000-0000-000000000001' WHERE "id" = 'default';

ALTER TABLE "restaurant_settings" DROP CONSTRAINT "restaurant_settings_pkey";

ALTER TABLE "restaurant_settings" DROP COLUMN "id";

ALTER TABLE "restaurant_settings" ALTER COLUMN "restaurant_id" SET NOT NULL;

ALTER TABLE "restaurant_settings" ADD CONSTRAINT "restaurant_settings_pkey" PRIMARY KEY ("restaurant_id");

ALTER TABLE "restaurant_settings" ADD CONSTRAINT "restaurant_settings_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
