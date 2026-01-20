import { Migration } from '@mikro-orm/migrations';

export class Migration20250101000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "wishlist" (
      "id" text not null,
      "customer_id" text not null,
      "sales_channel_id" text not null,
      "title" text null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "wishlist_pkey" primary key ("id")
    );`);

    this.addSql(`create table if not exists "wishlist_item" (
      "id" text not null,
      "wishlist_id" text not null,
      "product_variant_id" text not null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "wishlist_item_pkey" primary key ("id")
    );`);

    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wishlist_customer_id" ON "wishlist" (customer_id) WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wishlist_sales_channel_id" ON "wishlist" (sales_channel_id) WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wishlist_item_wishlist_id" ON "wishlist_item" (wishlist_id) WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wishlist_item_product_variant_id" ON "wishlist_item" (product_variant_id) WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_wishlist_item_unique" ON "wishlist_item" (wishlist_id, product_variant_id) WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "wishlist_item" cascade;`);
    this.addSql(`drop table if exists "wishlist" cascade;`);
  }
}

