-- CreateEnum
CREATE TYPE "menu_item_diet" AS ENUM ('VEG', 'NON_VEG', 'VEGAN');

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN "diet" "menu_item_diet" NOT NULL DEFAULT 'VEG';
