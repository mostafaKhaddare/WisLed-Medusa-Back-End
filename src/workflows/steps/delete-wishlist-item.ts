import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";

import { WISHLIST_MODULE } from "../../modules/wishlist";
import WishlistModuleService from "../../modules/wishlist/service";

import { MedusaError } from "@medusajs/framework/utils";

export type DeleteWishlistItemStepInput = {
  wishlist_item_id: string;
  customer_id: string;
};

export const deleteWishlistItemStep = createStep(
  "delete-wishlist-item-step",
  async (input: DeleteWishlistItemStepInput, { container }) => {
    const wishlistService: WishlistModuleService =
      container.resolve(WISHLIST_MODULE);

    // Get the wishlist item using query API
    const query = container.resolve("query");
    const itemsResult = await query.graph({
      entity: "wishlistItem",
      fields: ["*"],
      filters: {
        id: input.wishlist_item_id,
      },
    });
    const items = itemsResult.data || [];

    if (items.length === 0) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Wishlist item not found"
      );
    }

    const item = items[0];

    // Verify the wishlist belongs to the customer using Query API
    const { data: wishlists } = await query.graph({
      entity: "wishlist",
      fields: ["*"],
      filters: {
        id: item.wishlist_id,
        customer_id: input.customer_id,
      },
    });

    if (!wishlists || wishlists.length === 0) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Wishlist not found or access denied"
      );
    }

    const wishlist = wishlists[0];

    // Delete the item using service method
    await wishlistService.deleteWishlistItems([input.wishlist_item_id]);

    // Emit wishlist.item_removed event
    try {
      const eventBusService = container.resolve("eventBusService");
      await eventBusService.emit("wishlist.item_removed", {
        id: item.id,
        wishlist_id: wishlist.id,
        customer_id: wishlist.customer_id,
        product_variant_id: item.product_variant_id,
        sales_channel_id: wishlist.sales_channel_id,
      });
    } catch (error) {
      // Log but don't fail the workflow if event emission fails
      console.error("Failed to emit wishlist.item_removed event:", error);
    }

    return new StepResponse(wishlist, item);
  },
  async (compensationData, { container }) => {
    if (!compensationData) {
      return;
    }

    const wishlistService: WishlistModuleService =
      container.resolve(WISHLIST_MODULE);

    // Restore the deleted item using service method
    await wishlistService.upsertWishlistItems({
      wishlist_id: compensationData.wishlist_id,
      product_variant_id: compensationData.product_variant_id,
    });
  }
);

