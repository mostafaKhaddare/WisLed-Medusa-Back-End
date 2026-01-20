import { model } from "@medusajs/framework/utils";

const WishlistItem = model
  .define("wishlist_item", {
    id: model.id().primaryKey(),
    wishlist_id: model.text(),
    product_variant_id: model.text(),
    // Note: created_at, updated_at, and deleted_at are automatically added by Medusa v2
  })
  .indexes([
    {
      on: ["wishlist_id"],
      where: "deleted_at IS NULL",
      name: "IDX_wishlist_item_wishlist_id",
    },
    {
      on: ["product_variant_id"],
      where: "deleted_at IS NULL",
      name: "IDX_wishlist_item_product_variant_id",
    },
    {
      on: ["wishlist_id", "product_variant_id"],
      where: "deleted_at IS NULL",
      unique: true,
      name: "IDX_wishlist_item_unique",
    },
  ]);

export default WishlistItem;

