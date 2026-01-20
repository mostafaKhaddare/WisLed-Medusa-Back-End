import { createWishlistItemStep } from "../../../../../../src/workflows/steps/create-wishlist-item"
import { WISHLIST_MODULE } from "../../../../../../src/modules/wishlist"
import { MedusaError } from "@medusajs/framework/utils"

describe("createWishlistItemStep", () => {
  let mockContainer: any
  let mockWishlistService: any
  let mockQuery: any
  let mockEventBus: any
  let mockCreateWishlistWorkflow: any

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

    mockCreateWishlistWorkflow = jest.fn().mockReturnValue({
      run: jest.fn().mockResolvedValue({
        result: {
          wishlist: {
            id: "wishlist_123",
            customer_id: "customer_123",
            sales_channel_id: "sc_123",
          },
        },
      }),
    })

    mockContainer = {
      resolve: jest.fn((name: string) => {
        if (name === "query") return mockQuery
        if (name === WISHLIST_MODULE) return mockWishlistService
        if (name === "eventBusService") return mockEventBus
        return null
      }),
    }

    // Mock the workflow import
    jest.mock("../../create-wishlist", () => ({
      createWishlistWorkflow: mockCreateWishlistWorkflow,
    }))
  })

  it("should validate variant exists before creating item", async () => {
    mockQuery.graph.mockResolvedValueOnce({
      data: [], // Variant doesn't exist
    })

    const input = {
      variant_id: "non-existent-variant",
      customer_id: "customer_123",
      sales_channel_id: "sc_123",
    }

    await expect(
      createWishlistItemStep(input, { container: mockContainer })
    ).rejects.toThrow(MedusaError)

    expect(mockQuery.graph).toHaveBeenCalledWith({
      entity: "product_variant",
      fields: ["id"],
      filters: {
        id: "non-existent-variant",
      },
    })

    expect(mockWishlistService.WishlistItem.create).not.toHaveBeenCalled()
  })

  it("should create wishlist item when variant exists", async () => {
    const variantId = "variant_123"
    const customerId = "customer_123"
    const salesChannelId = "sc_123"

    // Mock variant exists
    mockQuery.graph.mockResolvedValueOnce({
      data: [{ id: variantId }],
    })

    // Mock no existing wishlist
    mockWishlistService.list.mockResolvedValueOnce([])

    // Mock wishlist creation
    mockCreateWishlistWorkflow.mockReturnValue({
      run: jest.fn().mockResolvedValue({
        result: {
          wishlist: {
            id: "wishlist_123",
            customer_id: customerId,
            sales_channel_id: salesChannelId,
          },
        },
      }),
    })

    // Mock no existing item
    mockQuery.graph.mockResolvedValueOnce({
      data: [],
    })

    // Mock item creation
    const createdItem = {
      id: "item_123",
      wishlist_id: "wishlist_123",
      product_variant_id: variantId,
    }
    mockWishlistService.WishlistItem.create.mockResolvedValueOnce(createdItem)

    const input = {
      variant_id: variantId,
      customer_id: customerId,
      sales_channel_id: salesChannelId,
    }

    const result = await createWishlistItemStep(input, {
      container: mockContainer,
    })

    expect(result.wishlist).toBeDefined()
    expect(mockWishlistService.WishlistItem.create).toHaveBeenCalledWith({
      wishlist_id: "wishlist_123",
      product_variant_id: variantId,
    })

    // Verify event emission
    expect(mockEventBus.emit).toHaveBeenCalledWith("wishlist.item_added", {
      id: createdItem.id,
      wishlist_id: "wishlist_123",
      customer_id: customerId,
      product_variant_id: variantId,
      sales_channel_id: salesChannelId,
    })
  })

  it("should return existing item when duplicate variant is added", async () => {
    const variantId = "variant_123"
    const existingItem = {
      id: "item_existing",
      wishlist_id: "wishlist_123",
      product_variant_id: variantId,
    }

    // Mock variant exists
    mockQuery.graph.mockResolvedValueOnce({
      data: [{ id: variantId }],
    })

    // Mock existing wishlist
    mockWishlistService.list.mockResolvedValueOnce([
      {
        id: "wishlist_123",
        customer_id: "customer_123",
        sales_channel_id: "sc_123",
      },
    ])

    // Mock existing item
    mockQuery.graph.mockResolvedValueOnce({
      data: [existingItem],
    })

    const input = {
      variant_id: variantId,
      customer_id: "customer_123",
      sales_channel_id: "sc_123",
    }

    const result = await createWishlistItemStep(input, {
      container: mockContainer,
    })

    expect(result.wishlist).toBeDefined()
    expect(mockWishlistService.WishlistItem.create).not.toHaveBeenCalled()
    expect(mockEventBus.emit).not.toHaveBeenCalled()
  })

  it("should handle event bus failure gracefully", async () => {
    const variantId = "variant_123"

    // Mock variant exists
    mockQuery.graph.mockResolvedValueOnce({
      data: [{ id: variantId }],
    })

    mockWishlistService.list.mockResolvedValueOnce([
      {
        id: "wishlist_123",
        customer_id: "customer_123",
        sales_channel_id: "sc_123",
      },
    ])

    // Mock no existing item
    mockQuery.graph.mockResolvedValueOnce({
      data: [],
    })

    // Mock event bus failure
    mockEventBus.emit.mockRejectedValueOnce(new Error("Event bus error"))

    const createdItem = {
      id: "item_123",
      wishlist_id: "wishlist_123",
      product_variant_id: variantId,
    }
    mockWishlistService.WishlistItem.create.mockResolvedValueOnce(createdItem)

    const input = {
      variant_id: variantId,
      customer_id: "customer_123",
      sales_channel_id: "sc_123",
    }

    // Should not throw error even if event emission fails
    const result = await createWishlistItemStep(input, {
      container: mockContainer,
    })

    expect(result.wishlist).toBeDefined()
    expect(mockWishlistService.WishlistItem.create).toHaveBeenCalled()
  })

  it("should compensate by deleting created item", async () => {
    const compensationData = {
      wishlist: { id: "wishlist_123" },
      item: { id: "item_123" },
    }

    await createWishlistItemStep.compensate(compensationData, {
      container: mockContainer,
    })

    expect(mockWishlistService.WishlistItem.delete).toHaveBeenCalledWith([
      "item_123",
    ])
  })

  it("should not compensate if no item was created", async () => {
    const compensationData = {
      wishlist: { id: "wishlist_123" },
      item: null,
    }

    const step = createWishlistItemStep as any
    if (step.compensate) {
      await step.compensate(compensationData, {
        container: mockContainer,
      })
    }

    expect(mockWishlistService.WishlistItem.delete).not.toHaveBeenCalled()
  })
})

