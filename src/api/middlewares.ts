import {
  defineMiddlewares,
  validateAndTransformBody,
} from "@medusajs/framework/http";

import { PostStoreCreateWishlistItem } from "./store/customers/me/wishlists/items/validators";

import { CreateCategoryImagesSchema } from "./admin/categories/[category_id]/images/route";
import {
  UpdateCategoryImagesSchema,
  DeleteCategoryImagesSchema,
} from "./admin/categories/[category_id]/images/batch/route";

export default defineMiddlewares({
  routes: [
    {
      matcher: "/admin/categories/:category_id/images",
      method: ["POST"],
      middlewares: [validateAndTransformBody(CreateCategoryImagesSchema)],
    },
    {
      // Validate body for batch UPDATE (POST)
      matcher: "/admin/categories/:category_id/images/batch",
      method: ["POST"],
      middlewares: [validateAndTransformBody(UpdateCategoryImagesSchema)],
    },
    {
      // Validate body for batch DELETE
      matcher: "/admin/categories/:category_id/images/batch",
      method: ["DELETE"],
      middlewares: [validateAndTransformBody(DeleteCategoryImagesSchema)],
    },
    {
      matcher: "/store/customers/me/wishlists/items",
      method: "POST",
      middlewares: [validateAndTransformBody(PostStoreCreateWishlistItem)],
    },
  ],
});
