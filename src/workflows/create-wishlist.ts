import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";

import { createWishlistStep } from "./steps/create-wishlist";

export type CreateWishlistInput = {
  customer_id: string;
  sales_channel_id: string;
  title?: string;
};

export const createWishlistWorkflow = createWorkflow(
  "create-wishlist",
  (input: CreateWishlistInput) => {
    const wishlist = createWishlistStep({
      customer_id: input.customer_id,
      sales_channel_id: input.sales_channel_id,
      title: input.title || "My Wishlist",
    });

    return new WorkflowResponse({ wishlist });
  }
);

