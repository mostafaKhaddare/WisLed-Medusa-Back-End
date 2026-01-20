import {
  defineMiddlewares,
  validateAndTransformBody,
} from "@medusajs/framework/http";

import { PostStoreCreateWishlistItem } from "./store/customers/me/wishlists/items/validators";

import { CreateCategoryImagesSchema } from "./admin/categories/[category_id]/images/route";

export default defineMiddlewares({
  routes: [
    {
      matcher: "/admin/categories/:category_id/images",

      method: ["POST"],

      middlewares: [validateAndTransformBody(CreateCategoryImagesSchema)],
    },
    {
      matcher: "/store/customers/me/wishlists/items",
      method: "POST",
      middlewares: [validateAndTransformBody(PostStoreCreateWishlistItem)],
    },
  ],
});
