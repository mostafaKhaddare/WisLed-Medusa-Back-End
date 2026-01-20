import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";

import { deleteWishlistItemStep } from "./steps/delete-wishlist-item";

export type DeleteWishlistItemInput = {
  wishlist_item_id: string;
  customer_id: string;
};

export const deleteWishlistItemWorkflow = createWorkflow(
  "delete-wishlist-item",
  (input: DeleteWishlistItemInput) => {
    const wishlist = deleteWishlistItemStep({
      wishlist_item_id: input.wishlist_item_id,
      customer_id: input.customer_id,
    });

    return new WorkflowResponse({ wishlist });
  }
);

