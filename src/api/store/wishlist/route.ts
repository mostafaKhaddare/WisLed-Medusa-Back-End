import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { createWishlistItemWorkflow } from "../../../workflows/create-wishlist-item";
import { MedusaError } from "@medusajs/framework/utils";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  if (!req.auth_context?.actor_id) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Authentication required"
    );
  }

  if (!req.publishable_key_context?.sales_channel_ids.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "At least one sales channel ID is required to be associated with the publishable API key in the request header."
    );
  }

  const query = req.scope.resolve("query");

  try {
    // Get the wishlist
    const { data: wishlists } = await query.graph({
      entity: "wishlist",
      fields: ["*"],
      filters: {
        customer_id: req.auth_context.actor_id,
        sales_channel_id: req.publishable_key_context?.sales_channel_ids[0],
      },
    });

    if (!wishlists || wishlists.length === 0) {
      return res.json({
        wishlist: null,
        items: [],
      });
    }

    const wishlist = wishlists[0];

    // Get wishlist items
    const { data: wishlistItems } = await query.graph({
      entity: "wishlistItem",
      fields: ["*"],
      filters: {
        wishlist_id: wishlist.id,
      },
    });

    if (!wishlistItems || wishlistItems.length === 0) {
      return res.json({
        wishlist,
        items: [],
      });
    }

    // Get product variant and product details for each item using query.graph
    const itemsWithDetails = await Promise.all(
      wishlistItems.map(async (item: any) => {
        try {
          // Get product variant
          const { data: variants } = await query.graph({
            entity: "product_variant",
            fields: ["id", "product_id", "sku", "title"],
            filters: {
              id: item.product_variant_id,
            },
          });

          if (!variants || variants.length === 0) {
            return {
              ...item,
              product_variant: null,
            };
          }

          const variant = variants[0];

          // Get product details
          const { data: products } = await query.graph({
            entity: "product",
            fields: ["id", "title", "handle", "thumbnail", "status"],
            filters: {
              id: variant.product_id,
            },
          });

          return {
            ...item,
            product_variant: {
              id: variant.id,
              product_id: variant.product_id,
              sku: variant.sku,
              title: variant.title,
              product:
                products && products.length > 0 ? products[0] : null,
            },
          };
        } catch (error) {
          console.error(
            `Error fetching product variant ${item.product_variant_id}:`,
            error
          );
          return {
            ...item,
            product_variant: null,
          };
        }
      })
    );

    return res.json({
      wishlist,
      items: itemsWithDetails,
    });
  } catch (error) {
    console.error("Error fetching wishlist:", error);
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `Failed to fetch wishlist: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  if (!req.auth_context?.actor_id) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Authentication required"
    );
  }

  if (!req.publishable_key_context?.sales_channel_ids.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "At least one sales channel ID is required to be associated with the publishable API key in the request header."
    );
  }

  const { variant_id } = req.body;

  if (!variant_id) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "variant_id is required"
    );
  }

  try {
    const { result } = await createWishlistItemWorkflow(req.scope).run({
      input: {
        variant_id,
        customer_id: req.auth_context.actor_id,
        sales_channel_id: req.publishable_key_context?.sales_channel_ids[0],
      },
    });

    res.json({
      wishlist: result.wishlist,
    });
  } catch (error) {
    console.error("Error in POST /store/wishlist:", {
      error,
      errorType: typeof error,
      errorConstructor: error?.constructor?.name,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      variant_id,
      customer_id: req.auth_context.actor_id,
    });
    
    // If it's already a MedusaError, re-throw it (it will be handled by the framework)
    if (error instanceof MedusaError) {
      throw error;
    }
    
    // Extract error message with better handling
    let errorMessage = "Unknown error";
    
    if (error instanceof Error) {
      errorMessage = error.message || error.name || error.toString();
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && typeof error === 'object') {
      // Try to extract message from error object
      const err = error as any;
      errorMessage = 
        err.message || 
        err.error?.message || 
        err.error || 
        err.reason ||
        err.toString() ||
        JSON.stringify(error);
    } else if (error !== null && error !== undefined) {
      errorMessage = String(error);
    }
    
    // Ensure we have a meaningful error message
    if (!errorMessage || errorMessage === "Unknown error" || errorMessage.trim() === "") {
      errorMessage = "An unexpected error occurred while adding item to wishlist";
    }
    
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `Failed to add item to wishlist: ${errorMessage}`
    );
  }
}

