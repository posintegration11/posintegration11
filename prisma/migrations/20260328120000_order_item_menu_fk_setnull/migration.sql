-- Allow deleting menu rows while keeping order line snapshots (menu_item_id optional, FK SET NULL).

ALTER TABLE "order_items" DROP CONSTRAINT "order_items_menu_item_id_fkey";

ALTER TABLE "order_items" ALTER COLUMN "menu_item_id" DROP NOT NULL;

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
