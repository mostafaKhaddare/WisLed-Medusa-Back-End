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
    const stepInput = {
      ...input,
      title: input.title || "My Wishlist",
    };

    const wishlist = createWishlistStep(stepInput);

    return new WorkflowResponse({ wishlist });
  }
);

