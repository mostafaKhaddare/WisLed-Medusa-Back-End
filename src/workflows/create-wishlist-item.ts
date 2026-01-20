import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";

import { createWishlistItemStep } from "./steps/create-wishlist-item";

export type CreateWishlistItemInput = {
  variant_id: string;
  customer_id: string;
  sales_channel_id: string;
};

export const createWishlistItemWorkflow = createWorkflow(
  "create-wishlist-item",
  (input: CreateWishlistItemInput) => {
    const wishlist = createWishlistItemStep({
      variant_id: input.variant_id,
      customer_id: input.customer_id,
      sales_channel_id: input.sales_channel_id,
    });

    return new WorkflowResponse({ wishlist });
  }
);

