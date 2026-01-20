import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework";

import { deleteWishlistItemWorkflow } from "../../../../../../../workflows/delete-wishlist-item";

import { MedusaError } from "@medusajs/framework/utils";

export async function DELETE(
  req: AuthenticatedMedusaRequest,

  res: MedusaResponse
) {
  if (!req.auth_context?.actor_id) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Authentication required"
    );
  }

  const { result } = await deleteWishlistItemWorkflow(req.scope).run({
    input: {
      wishlist_item_id: req.params.id,

      customer_id: req.auth_context.actor_id,
    },
  });

  res.json({
    wishlist: result.wishlist,
  });
}
