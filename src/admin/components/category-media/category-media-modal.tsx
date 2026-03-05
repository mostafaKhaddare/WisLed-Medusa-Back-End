import { useState, useRef } from "react";

import { FocusModal, Button, Heading, toast } from "@medusajs/ui";

import { useQueryClient } from "@tanstack/react-query";

import { CategoryImage, UploadedFile } from "../../types";

import { CategoryImageGallery } from "./category-image-gallery";

import { CategoryImageUpload } from "./category-image-upload";

import { useCategoryImageMutations } from "../../hooks/use-category-image";
import { CommandBar } from "@medusajs/ui";

type CategoryMediaModalProps = {
  categoryId: string;

  existingImages: CategoryImage[];
};

export const CategoryMediaModal = ({
  categoryId,
  existingImages,
}: CategoryMediaModalProps) => {
  const [open, setOpen] = useState(false);
  // update
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(
    new Set()
  );
  // delete
  const [imagesToDelete, setImagesToDelete] = useState<Set<string>>(new Set());
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  const [currentThumbnailId, setCurrentThumbnailId] = useState<string | null>(
    null
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();

  const {
    uploadFilesMutation,
    updateImagesMutation,
    createImagesMutation,
    deleteImagesMutation,
  } = useCategoryImageMutations({
    categoryId,

    onCreateSuccess: () => {
      setOpen(false);

      resetModalState();
    },
    onUpdateSuccess: () => {
      setSelectedImageIds(new Set());
    },
    onDeleteSuccess: (deletedIds) => {
      setSelectedImageIds(new Set());

      if (currentThumbnailId && deletedIds.includes(currentThumbnailId)) {
        setCurrentThumbnailId(null);
      }
    },
  });

  const isSaving =
    createImagesMutation.isPending ||
    updateImagesMutation.isPending ||
    deleteImagesMutation.isPending;

  const resetModalState = () => {
    setUploadedFiles([]);
    setSelectedImageIds(new Set());
    setCurrentThumbnailId(null);
    setImagesToDelete(new Set());
  };

  const initializeThumbnail = () => {
    const thumbnailImage = existingImages.find(
      (img) => img.type === "thumbnail"
    );

    if (thumbnailImage?.id) {
      setCurrentThumbnailId(thumbnailImage.id);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);

    if (isOpen) {
      initializeThumbnail();
    } else {
      resetModalState();
    }
  };

  const handleUploadFile = (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }

    const filesArray = Array.from(files);

    uploadFilesMutation.mutate(filesArray, {
      onSuccess: (data) => {
        console.log("[CategoryMedia] Upload success:", data.files);
        setUploadedFiles((prev) => [...prev, ...data.files]);
      },
      onError: (error) => {
        console.error("[CategoryMedia] Upload failed:", error);
        toast.error("Failed to upload image. Please try again.");
      },
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // handle image selection
  const handleImageSelection = (id: string, isUploaded: boolean = false) => {
    const itemId = isUploaded ? `uploaded:${id}` : id;

    const newSelected = new Set(selectedImageIds);

    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }

    setSelectedImageIds(newSelected);
  };

  // handle thumbnail image
  const handleSetAsThumbnail = () => {
    if (selectedImageIds.size !== 1) {
      return;
    }

    const selectedId = Array.from(selectedImageIds)[0];

    setCurrentThumbnailId(selectedId);

    if (selectedId.startsWith("uploaded:")) {
      // update uploaded file type to thumbnail

      const uploadedFileId = selectedId.replace("uploaded:", "");

      setUploadedFiles((prev) =>
        prev.map((file) => {
          return file.id === uploadedFileId
            ? { ...file, type: "thumbnail" }
            : file;
        })
      );
    }

    setSelectedImageIds(new Set());
  };

  // handle delete
  const handleDelete = () => {
    if (selectedImageIds.size === 0) {
      return;
    }

    const uploadedFileIds: string[] = [];

    const savedImageIds: string[] = [];

    selectedImageIds.forEach((id) => {
      if (id.startsWith("uploaded:")) {
        uploadedFileIds.push(id.replace("uploaded:", ""));
      } else {
        savedImageIds.push(id);
      }
    });

    if (uploadedFileIds.length > 0) {
      setUploadedFiles((prev) =>
        prev.filter((file) => !uploadedFileIds.includes(file.id))
      );

      if (currentThumbnailId?.startsWith("uploaded:")) {
        const thumbnailFileId = currentThumbnailId.replace("uploaded:", "");

        if (uploadedFileIds.includes(thumbnailFileId)) {
          setCurrentThumbnailId(null);
        }
      }
    }

    if (savedImageIds.length > 0) {
      setImagesToDelete((prev) => {
        const newSet = new Set(prev);

        savedImageIds.forEach((id) => newSet.add(id));

        return newSet;
      });

      if (currentThumbnailId && savedImageIds.includes(currentThumbnailId)) {
        setCurrentThumbnailId(null);
      }
    }

    setSelectedImageIds(new Set());
  };

  /**
   * Determine the correct type for a newly uploaded file.
   *
   * Priority order:
   *  1. Explicitly set to "thumbnail" via "Set as thumbnail" action
   *  2. If there are no existing images (not being deleted) AND this is the
   *     first uploaded file → auto-assign "thumbnail"
   *  3. If the existing thumbnail is being deleted and this is the only new
   *     file → auto-assign "thumbnail" so there's always a thumbnail
   *  4. Otherwise → "image"
   */
  const resolveUploadedFileType = (
    file: UploadedFile,
    index: number,
    allUploadedFiles: UploadedFile[],
    existingIdsToDelete: Set<string>
  ): "thumbnail" | "image" => {
    // Already explicitly marked as thumbnail
    if (file.type === "thumbnail") return "thumbnail";

    const uploadedId = `uploaded:${file.id}`;
    if (currentThumbnailId === uploadedId) return "thumbnail";

    // Determine if there will be any surviving existing images after save
    const survivingExistingImages = existingImages.filter(
      (img) => img.id && !existingIdsToDelete.has(img.id)
    );

    // If no surviving existing images and this is the first new file, make it thumbnail
    if (survivingExistingImages.length === 0 && index === 0) {
      return "thumbnail";
    }

    // If the current thumbnail is being deleted and this is the first new file, promote it
    const existingThumbnail = existingImages.find(
      (img) => img.type === "thumbnail"
    );
    const thumbnailIsBeingDeleted =
      existingThumbnail?.id && existingIdsToDelete.has(existingThumbnail.id);

    if (thumbnailIsBeingDeleted && index === 0) {
      return "thumbnail";
    }

    return "image";
  };

  /**
   * Save handler — runs operations **sequentially** to avoid race conditions:
   *
   *   1. Delete images marked for removal (await)
   *   2. Create newly uploaded images (await)
   *   3. Update thumbnail designation for existing images (await)
   *
   * Running all three in parallel with Promise.all caused the "update fails"
   * issue because the DB could still have the old thumbnail row when the
   * update arrived, leading to constraint violations or silent no-ops.
   */
  const handleSave = async () => {
    const hasNewImages = uploadedFiles.length > 0;
    const hasImagesToDelete = imagesToDelete.size > 0;

    const initialThumbnail = existingImages.find(
      (img) => img.type === "thumbnail"
    );

    const thumbnailChanged =
      currentThumbnailId &&
      !currentThumbnailId.startsWith("uploaded:") &&
      currentThumbnailId !== initialThumbnail?.id;

    if (!hasNewImages && !hasImagesToDelete && !thumbnailChanged) {
      console.log("[CategoryMedia] No changes detected, closing modal.");
      setOpen(false);
      return;
    }

    console.log("[CategoryMedia] Starting save:", {
      hasNewImages,
      hasImagesToDelete,
      thumbnailChanged,
      uploadedFiles,
      imagesToDelete: Array.from(imagesToDelete),
      currentThumbnailId,
    });

    try {
      // ── Step 1: Delete existing images that were removed ──────────────────
      if (hasImagesToDelete) {
        const idsToDelete = Array.from(imagesToDelete);
        console.log("[CategoryMedia] Deleting images:", idsToDelete);

        await deleteImagesMutation.mutateAsync(idsToDelete);

        console.log("[CategoryMedia] Delete complete.");
      }

      // ── Step 2: Create newly uploaded images ──────────────────────────────
      if (hasNewImages) {
        const imagesToCreate = uploadedFiles.map((file, index) => ({
          url: file.url,
          file_id: file.id,
          type: resolveUploadedFileType(
            file,
            index,
            uploadedFiles,
            imagesToDelete
          ),
        }));

        console.log("[CategoryMedia] Creating images:", imagesToCreate);

        await createImagesMutation.mutateAsync(imagesToCreate);

        console.log("[CategoryMedia] Create complete.");
      }

      // ── Step 3: Update thumbnail designation for surviving existing images ─
      if (
        thumbnailChanged &&
        !(hasNewImages && currentThumbnailId?.startsWith("uploaded:"))
      ) {
        const updates = [
          {
            id: currentThumbnailId!,
            type: "thumbnail" as const,
          },
        ];

        console.log("[CategoryMedia] Updating thumbnail:", updates);

        await updateImagesMutation.mutateAsync(updates);

        console.log("[CategoryMedia] Update complete.");
      }

      // ── Invalidate query cache ─────────────────────────────────────────────
      await queryClient.invalidateQueries({
        queryKey: ["category-images", categoryId],
      });

      setOpen(false);
      resetModalState();

      toast.success("Category media saved successfully");
    } catch (error) {
      console.error("[CategoryMedia] Save failed:", error);

      const message =
        error instanceof Error ? error.message : "Unknown error occurred";

      toast.error(`Failed to save changes: ${message}`);
    }
  };

  return (
    <>
      <CommandBar open={selectedImageIds.size > 0}>
        <CommandBar.Bar>
          <CommandBar.Value>{selectedImageIds.size} selected</CommandBar.Value>

          <CommandBar.Seperator />

          <CommandBar.Command
            action={handleSetAsThumbnail}
            label="Set as thumbnail"
            shortcut="t"
            disabled={selectedImageIds.size !== 1}
          />

          <CommandBar.Seperator />

          <CommandBar.Command
            action={handleDelete}
            label="Delete"
            shortcut="d"
          />
        </CommandBar.Bar>
      </CommandBar>

      <FocusModal open={open} onOpenChange={handleOpenChange}>
        <FocusModal.Trigger asChild>
          <Button size="small" variant="secondary">
            Edit
          </Button>
        </FocusModal.Trigger>

        <FocusModal.Content>
          <FocusModal.Header>
            <Heading>Edit Media</Heading>
          </FocusModal.Header>

          <FocusModal.Body className="flex h-full overflow-hidden">
            <div className="flex w-full h-full flex-col-reverse lg:grid lg:grid-cols-[1fr_560px]">
              <CategoryImageGallery
                existingImages={existingImages}
                uploadedFiles={uploadedFiles}
                currentThumbnailId={currentThumbnailId}
                selectedImageIds={selectedImageIds}
                onToggleSelect={handleImageSelection}
                imagesToDelete={imagesToDelete}
              />

              <CategoryImageUpload
                fileInputRef={fileInputRef}
                isUploading={uploadFilesMutation.isPending}
                onFileSelect={handleUploadFile}
              />
            </div>
          </FocusModal.Body>

          <FocusModal.Footer>
            <div className="flex items-center justify-end gap-x-2">
              <FocusModal.Close asChild>
                <Button size="small" variant="secondary">
                  Cancel
                </Button>
              </FocusModal.Close>

              <Button size="small" onClick={handleSave} isLoading={isSaving}>
                Save
              </Button>
            </div>
          </FocusModal.Footer>
        </FocusModal.Content>
      </FocusModal>
    </>
  );
};
