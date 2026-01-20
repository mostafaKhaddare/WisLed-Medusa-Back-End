import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";

import { WISHLIST_MODULE } from "../../modules/wishlist";
import WishlistModuleService from "../../modules/wishlist/service";

import { MedusaError } from "@medusajs/framework/utils";
import { createWishlistWorkflow } from "../create-wishlist";

export type CreateWishlistItemStepInput = {
  variant_id: string;
  customer_id: string;
  sales_channel_id: string;
};

export const createWishlistItemStep = createStep(
  "create-wishlist-item-step",
  async (input: CreateWishlistItemStepInput, { container }) => {
    const wishlistService: WishlistModuleService =
      container.resolve(WISHLIST_MODULE);

    // Validate variant exists before proceeding
    const query = container.resolve("query");
    const { data: variants } = await query.graph({
      entity: "product_variant",
      fields: ["id"],
      filters: {
        id: input.variant_id,
      },
    });

    if (!variants || variants.length === 0) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Product variant with id ${input.variant_id} not found`
      );
    }

    // Get or create wishlist using Query API
    const { data: wishlists } = await query.graph({
      entity: "wishlist",
      fields: ["*"],
      filters: {
        customer_id: input.customer_id,
        sales_channel_id: input.sales_channel_id,
      },
    });

    let wishlist = wishlists && wishlists.length > 0 ? wishlists[0] : null;

    if (!wishlist) {
      const { result } = await createWishlistWorkflow(container).run({
        input: {
          customer_id: input.customer_id,
          sales_channel_id: input.sales_channel_id,
        },
      });
      wishlist = result.wishlist;
    }

    // Check if item already exists using query API
    const existingItemsResult = await query.graph({
      entity: "wishlistItem",
      fields: ["*"],
      filters: {
        wishlist_id: wishlist.id,
        product_variant_id: input.variant_id,
      },
    });

    if (existingItemsResult.data?.length > 0) {
      // Item already in wishlist, return existing wishlist
      return new StepResponse(wishlist, { wishlist, item: existingItemsResult.data[0] });
    }

    // Create wishlist item - use the service's create method for WishlistItem
    // MedusaService provides create method for each model
    try {
      const [item] = await wishlistService.upsertWishlistItems({
        wishlist_id: wishlist.id,
        product_variant_id: input.variant_id,
      });

      // Emit wishlist.item_added event
      try {
        const eventBusService = container.resolve("eventBusService");
        await eventBusService.emit("wishlist.item_added", {
          id: item.id,
          wishlist_id: wishlist.id,
          customer_id: wishlist.customer_id,
          product_variant_id: input.variant_id,
          sales_channel_id: wishlist.sales_channel_id,
        });
      } catch (error) {
        // Log but don't fail the workflow if event emission fails
        console.error("Failed to emit wishlist.item_added event:", error);
      }

      return new StepResponse(wishlist, { wishlist, item });
    } catch (error) {
      // Enhanced error logging and handling
      let errorMessage = "Failed to create wishlist item";
      
      if (error instanceof MedusaError) {
        // Re-throw MedusaError as-is (it has proper message)
        throw error;
      } else if (error instanceof Error) {
        errorMessage = error.message || error.name || error.toString();
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object') {
        const err = error as any;
        errorMessage = 
          err.message || 
          err.error?.message || 
          err.error || 
          err.reason ||
          err.toString() ||
          JSON.stringify(error);
      }
      
      console.error("Error creating wishlist item:", {
        error,
        errorType: typeof error,
        errorConstructor: error?.constructor?.name,
        wishlist_id: wishlist.id,
        variant_id: input.variant_id,
        errorMessage,
        errorStack: error instanceof Error ? error.stack : undefined,
      });
      
      // Throw a proper MedusaError with the extracted message
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        errorMessage || "Failed to create wishlist item"
      );
    }
  },
  async (compensationData, { container }) => {
    if (!compensationData?.item) {
      return;
    }

    const wishlistService: WishlistModuleService =
      container.resolve(WISHLIST_MODULE);

    // Delete using service method
    await wishlistService.deleteWishlistItems([compensationData.item.id]);
  }
);

