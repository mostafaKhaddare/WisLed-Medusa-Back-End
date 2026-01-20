import { MedusaService } from "@medusajs/framework/utils";

import Wishlist from "./models/wishlist";
import WishlistItem from "./models/wishlist-item";

class WishlistModuleService extends MedusaService({
  Wishlist,
  WishlistItem,
}) {
  // Access WishlistItem methods - MedusaService provides these automatically
  // but we'll add explicit methods for clarity
  get wishlistItemService() {
    // @ts-ignore - Access the underlying service for WishlistItem
    return this.WishlistItem;
  }

  /**
   * Get wishlist counts for given variant IDs
   * Returns a record mapping variant_id to count of wishlists containing that variant
   * Note: This method requires the query service to be passed via container context
   */
  async getWishlistsOfVariants(
    variantIds: string[],
    container?: any
  ): Promise<Record<string, number>> {
    if (!variantIds || variantIds.length === 0) {
      return {};
    }

    // Get query service from container if available, otherwise try to resolve it
    let query;
    if (container) {
      query = container.resolve("query");
    } else {
      // Try to get from service context (may not always work)
      query = (this as any).__container?.resolve?.("query");
    }

    if (!query) {
      throw new Error("Query service not available. Container must be provided.");
    }

    const { data: items } = await query.graph({
      entity: "wishlistItem",
      fields: ["product_variant_id"],
      filters: {
        product_variant_id: { $in: variantIds },
      },
    });

    // Count occurrences per variant
    const counts: Record<string, number> = {};
    variantIds.forEach((variantId) => {
      counts[variantId] = 0;
    });

    if (items && Array.isArray(items)) {
      items.forEach((item: any) => {
        if (item.product_variant_id && counts.hasOwnProperty(item.product_variant_id)) {
          counts[item.product_variant_id] = (counts[item.product_variant_id] || 0) + 1;
        }
      });
    }

    return counts;
  }
}

export default WishlistModuleService;

