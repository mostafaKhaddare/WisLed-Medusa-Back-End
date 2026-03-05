import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";

import { PRODUCT_MEDIA_MODULE } from "../../modules/product-media";

import ProductMediaModuleService from "../../modules/product-media/service";

export type UpdateCategoryImagesStepInput = {
  updates: {
    id: string;

    type?: "thumbnail" | "image";
  }[];
};

export const updateCategoryImagesStep = createStep(
  "update-category-images-step",

  async (input: UpdateCategoryImagesStepInput, { container }) => {
    const productMediaService: ProductMediaModuleService =
      container.resolve(PRODUCT_MEDIA_MODULE);

    // Get previous data for the images being updated (for compensation)
    const prevData = await productMediaService.listProductCategoryImages({
      id: input.updates.map((u) => u.id),
    });

    // ── KEY FIX: demote existing thumbnails BEFORE promoting a new one ────────
    // The DB has a unique partial index on (category_id, type) WHERE type='thumbnail'.
    // Promoting an image to "thumbnail" while another record for the same
    // category still holds type='thumbnail' triggers a constraint violation.
    // We must demote ALL existing thumbnails for the affected categories first.
    const thumbnailUpdates = input.updates.filter(
      (u) => u.type === "thumbnail"
    );

    if (thumbnailUpdates.length > 0) {
      // Figure out which categories are affected
      const affectedImageIds = thumbnailUpdates.map((u) => u.id);

      const affectedImages = await productMediaService.listProductCategoryImages(
        { id: affectedImageIds }
      );

      const affectedCategoryIds = [...new Set(affectedImages.map((img) => img.category_id))];

      if (affectedCategoryIds.length > 0) {
        // Find existing thumbnails in those categories (excluding the ones
        // we are about to promote, to avoid a no-op update on them)
        const existingThumbnails =
          await productMediaService.listProductCategoryImages({
            type: "thumbnail",
            category_id: affectedCategoryIds,
          });

        const idsToPromote = new Set(affectedImageIds);

        const thumbnailsToDemote = existingThumbnails.filter(
          (t) => !idsToPromote.has(t.id)
        );

        if (thumbnailsToDemote.length > 0) {
          await productMediaService.updateProductCategoryImages(
            thumbnailsToDemote.map((t) => ({
              id: t.id,
              type: "image" as const,
            }))
          );
        }
      }
    }

    // Apply the requested updates
    const updatedData = await productMediaService.updateProductCategoryImages(
      input.updates
    );

    return new StepResponse(updatedData, prevData);
  },

  async (compensationData, { container }) => {
    if (!compensationData?.length) {
      return;
    }

    const productMediaService: ProductMediaModuleService =
      container.resolve(PRODUCT_MEDIA_MODULE);

    // Revert all updates to their previous state
    await productMediaService.updateProductCategoryImages(
      compensationData.map((img) => ({
        id: img.id,
        type: img.type,
      }))
    );
  }
);
