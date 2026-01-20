import { model } from "@medusajs/framework/utils";

const Wishlist = model
  .define("wishlist", {
    id: model.id().primaryKey(),
    customer_id: model.text(),
    sales_channel_id: model.text(),
    title: model.text().nullable(),
    // Note: created_at, updated_at, and deleted_at are automatically added by Medusa v2
  })
  .indexes([
    {
      on: ["customer_id"],
      where: "deleted_at IS NULL",
      name: "IDX_wishlist_customer_id",
    },
    {
      on: ["sales_channel_id"],
      where: "deleted_at IS NULL",
      name: "IDX_wishlist_sales_channel_id",
    },
  ]);

export default Wishlist;

