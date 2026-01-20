import { deleteWishlistItemStep } from "../../../../../../src/workflows/steps/delete-wishlist-item"
import { WISHLIST_MODULE } from "../../../../../../src/modules/wishlist"
import { MedusaError } from "@medusajs/framework/utils"

describe("deleteWishlistItemStep", () => {
  let mockContainer: any
  let mockWishlistService: any
  let mockQuery: any
  let mockEventBus: any

  beforeEach(() => {
    mockEventBus = {
      emit: jest.fn().mockResolvedValue(undefined),
    }

    mockQuery = {
      graph: jest.fn(),
    }

    mockWishlistService = {
      list: jest.fn(),
      WishlistItem: {
        create: jest.fn(),
        delete: jest.fn(),
      },
    }

    mockContainer = {
      resolve: jest.fn((name: string) => {
        if (name === "query") return mockQuery
        if (name === WISHLIST_MODULE) return mockWishlistService
        if (name === "eventBusService") return mockEventBus
        return null
      }),
    }
  })

  it("should throw error if wishlist item not found", async () => {
    mockQuery.graph.mockResolvedValueOnce({
      data: [],
    })

    const input = {
      wishlist_item_id: "non-existent-item",
      customer_id: "customer_123",
    }

    await expect(
      deleteWishlistItemStep(input, { container: mockContainer })
    ).rejects.toThrow(MedusaError)

    expect(mockWishlistService.WishlistItem.delete).not.toHaveBeenCalled()
  })

  it("should throw error if wishlist doesn't belong to customer", async () => {
    const item = {
      id: "item_123",
      wishlist_id: "wishlist_123",
      product_variant_id: "variant_123",
    }

    mockQuery.graph.mockResolvedValueOnce({
      data: [item],
    })

    mockWishlistService.list.mockResolvedValueOnce([]) // No wishlist found for customer

    const input = {
      wishlist_item_id: "item_123",
      customer_id: "customer_123",
    }

    await expect(
      deleteWishlistItemStep(input, { container: mockContainer })
    ).rejects.toThrow(MedusaError)

    expect(mockWishlistService.WishlistItem.delete).not.toHaveBeenCalled()
  })

  it("should delete wishlist item successfully", async () => {
    const item = {
      id: "item_123",
      wishlist_id: "wishlist_123",
      product_variant_id: "variant_123",
    }

    const wishlist = {
      id: "wishlist_123",
      customer_id: "customer_123",
      sales_channel_id: "sc_123",
    }

    mockQuery.graph.mockResolvedValueOnce({
      data: [item],
    })

    mockWishlistService.list.mockResolvedValueOnce([wishlist])

    const input = {
      wishlist_item_id: "item_123",
      customer_id: "customer_123",
    }

    const result = await deleteWishlistItemStep(input, {
      container: mockContainer,
    })

    expect(result).toBeDefined()
    expect(mockWishlistService.WishlistItem.delete).toHaveBeenCalledWith([
      "item_123",
    ])

    // Verify event emission
    expect(mockEventBus.emit).toHaveBeenCalledWith("wishlist.item_removed", {
      id: item.id,
      wishlist_id: wishlist.id,
      customer_id: wishlist.customer_id,
      product_variant_id: item.product_variant_id,
      sales_channel_id: wishlist.sales_channel_id,
    })
  })

  it("should handle event bus failure gracefully", async () => {
    const item = {
      id: "item_123",
      wishlist_id: "wishlist_123",
      product_variant_id: "variant_123",
    }

    const wishlist = {
      id: "wishlist_123",
      customer_id: "customer_123",
      sales_channel_id: "sc_123",
    }

    mockQuery.graph.mockResolvedValueOnce({
      data: [item],
    })

    mockWishlistService.list.mockResolvedValueOnce([wishlist])

    // Mock event bus failure
    mockEventBus.emit.mockRejectedValueOnce(new Error("Event bus error"))

    const input = {
      wishlist_item_id: "item_123",
      customer_id: "customer_123",
    }

    // Should not throw error even if event emission fails
    const result = await deleteWishlistItemStep(input, {
      container: mockContainer,
    })

    expect(result).toBeDefined()
    expect(mockWishlistService.WishlistItem.delete).toHaveBeenCalled()
  })

  it("should compensate by restoring deleted item", async () => {
    const compensationData = {
      id: "item_123",
      wishlist_id: "wishlist_123",
      product_variant_id: "variant_123",
    }

    const step = deleteWishlistItemStep as any
    if (step.compensate) {
      await step.compensate(compensationData, {
        container: mockContainer,
      })
    }

    expect(mockWishlistService.WishlistItem.create).toHaveBeenCalledWith({
      wishlist_id: "wishlist_123",
      product_variant_id: "variant_123",
    })
  })

  it("should not compensate if no compensation data", async () => {
    await deleteWishlistItemStep.compensate(null, {
      container: mockContainer,
    })

    expect(mockWishlistService.WishlistItem.create).not.toHaveBeenCalled()
  })
})

