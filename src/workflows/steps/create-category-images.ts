import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";

import { PRODUCT_MEDIA_MODULE } from "../../modules/product-media";

import ProductMediaModuleService from "../../modules/product-media/service";

import { MedusaError } from "@medusajs/framework/utils";

export type CreateCategoryImagesStepInput = {
  category_images: {
    category_id: string;

    type: "thumbnail" | "image";

    url: string;

    file_id: string;
  }[];
};

export const createCategoryImagesStep = createStep(
  "create-category-images-step",

  async (input: CreateCategoryImagesStepInput, { container }) => {
    const productMediaService: ProductMediaModuleService =
      container.resolve(PRODUCT_MEDIA_MODULE);

    // Group images by category to handle thumbnails efficiently
    const imagesByCategory = input.category_images.reduce((acc, img) => {
      if (!acc[img.category_id]) {
        acc[img.category_id] = [];
      }

      acc[img.category_id].push(img);

      return acc;
    }, {} as Record<string, typeof input.category_images>);

    // Validate: only one thumbnail per category in the incoming batch
    for (const [_, images] of Object.entries(imagesByCategory)) {
      const thumbnailImages = images.filter((img) => img.type === "thumbnail");

      if (thumbnailImages.length > 1) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Only one thumbnail is allowed per category"
        );
      }
    }

    // ── KEY FIX: demote existing thumbnails BEFORE inserting new ones ────────
    // The DB has a unique partial index on (category_id, type) WHERE type='thumbnail'.
    // If we try to insert a new thumbnail while an old one still exists we get
    // a constraint violation. We must convert existing thumbnails to "image" first.
    const categoryIdsWithNewThumbnail = Object.entries(imagesByCategory)
      .filter(([_, images]) =>
        images.some((img) => img.type === "thumbnail")
      )
      .map(([categoryId]) => categoryId);

    const demotedThumbnailIds: string[] = [];

    if (categoryIdsWithNewThumbnail.length > 0) {
      const existingThumbnails =
        await productMediaService.listProductCategoryImages({
          type: "thumbnail",
          category_id: categoryIdsWithNewThumbnail,
        });

      if (existingThumbnails.length > 0) {
        demotedThumbnailIds.push(...existingThumbnails.map((t) => t.id));

        // Convert old thumbnails → "image" so the unique constraint is clear
        await productMediaService.updateProductCategoryImages(
          existingThumbnails.map((t) => ({
            id: t.id,
            type: "image" as const,
          }))
        );
      }
    }

    // Create all incoming category images
    const createdImages = await productMediaService.createProductCategoryImages(
      Object.values(imagesByCategory).flat()
    );

    // Store both created IDs and demoted IDs for compensation
    return new StepResponse(createdImages, {
      createdIds: createdImages.map((img) => img.id),
      demotedThumbnailIds,
    });
  },

  async (compensationData, { container }) => {
    if (!compensationData) {
      return;
    }

    const productMediaService: ProductMediaModuleService =
      container.resolve(PRODUCT_MEDIA_MODULE);

    const { createdIds, demotedThumbnailIds } = compensationData;

    // Delete images that were created in the forward step
    if (createdIds?.length) {
      await productMediaService.deleteProductCategoryImages(createdIds);
    }

    // Restore demoted thumbnails back to "thumbnail"
    if (demotedThumbnailIds?.length) {
      await productMediaService.updateProductCategoryImages(
        demotedThumbnailIds.map((id) => ({
          id,
          type: "thumbnail" as const,
        }))
      );
    }
  }
);
