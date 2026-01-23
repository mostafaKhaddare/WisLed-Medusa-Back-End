import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";

import { WISHLIST_MODULE } from "../../modules/wishlist";
import WishlistModuleService from "../../modules/wishlist/service";

import { MedusaError } from "@medusajs/framework/utils";

export type CreateWishlistStepInput = {
  customer_id: string;
  sales_channel_id: string;
  title: string;
};

export const createWishlistStep = createStep(
  "create-wishlist-step",
  async (input: CreateWishlistStepInput, { container }) => {
    const wishlistService: WishlistModuleService =
      container.resolve(WISHLIST_MODULE);

    // Check if wishlist already exists for this customer and sales channel using Query API
    const query = container.resolve("query");
    const { data: existingWishlists } = await query.graph({
      entity: "wishlist",
      fields: ["*"],
      filters: {
        customer_id: input.customer_id,
        sales_channel_id: input.sales_channel_id,
      },
    });

    if (existingWishlists && existingWishlists.length > 0) {
      return new StepResponse(existingWishlists[0], existingWishlists[0]);
    }

    const [wishlist] = await wishlistService.createWishlists([
      {
        customer_id: input.customer_id,
        sales_channel_id: input.sales_channel_id,
        title: input.title,
      },
    ]);

    // Emit wishlist.created event
    try {
      const eventBusService = container.resolve("eventBusService") as any;
      await eventBusService.emit("wishlist.created", {
        id: wishlist.id,
        customer_id: wishlist.customer_id,
        sales_channel_id: wishlist.sales_channel_id,
        title: wishlist.title,
      });
    } catch (error) {
      // Log but don't fail the workflow if event emission fails
      console.error("Failed to emit wishlist.created event:", error);
    }

    return new StepResponse(wishlist, wishlist);
  },
  async (compensationData, { container }) => {
    if (!compensationData) {
      return;
    }

    const wishlistService: WishlistModuleService =
      container.resolve(WISHLIST_MODULE);

    await wishlistService.deleteWishlists([compensationData.id]);
  }
);

