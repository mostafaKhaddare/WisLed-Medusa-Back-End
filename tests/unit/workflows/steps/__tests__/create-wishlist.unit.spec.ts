import { createWishlistStep } from "../../../../../../src/workflows/steps/create-wishlist"
import { WISHLIST_MODULE } from "../../../../../../src/modules/wishlist"

describe("createWishlistStep", () => {
  let mockContainer: any
  let mockWishlistService: any
  let mockEventBus: any

  beforeEach(() => {
    mockEventBus = {
      emit: jest.fn().mockResolvedValue(undefined),
    }

    mockWishlistService = {
      list: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    }

    mockContainer = {
      resolve: jest.fn((name: string) => {
        if (name === WISHLIST_MODULE) return mockWishlistService
        if (name === "eventBusService") return mockEventBus
        return null
      }),
    }
  })

  it("should return existing wishlist if one exists", async () => {
    const existingWishlist = {
      id: "wishlist_123",
      customer_id: "customer_123",
      sales_channel_id: "sc_123",
      title: "My Wishlist",
    }

    mockWishlistService.list.mockResolvedValueOnce([existingWishlist])

    const input = {
      customer_id: "customer_123",
      sales_channel_id: "sc_123",
      title: "My Wishlist",
    }

    const result = await createWishlistStep(input, {
      container: mockContainer,
    })

    expect(result).toEqual(existingWishlist)
    expect(mockWishlistService.create).not.toHaveBeenCalled()
    expect(mockEventBus.emit).not.toHaveBeenCalled()
  })

  it("should create new wishlist when none exists", async () => {
    mockWishlistService.list.mockResolvedValueOnce([])

    const newWishlist = {
      id: "wishlist_new",
      customer_id: "customer_123",
      sales_channel_id: "sc_123",
      title: "My Wishlist",
    }

    mockWishlistService.create.mockResolvedValueOnce(newWishlist)

    const input = {
      customer_id: "customer_123",
      sales_channel_id: "sc_123",
      title: "My Wishlist",
    }

    const result = await createWishlistStep(input, {
      container: mockContainer,
    })

    expect(result).toEqual(newWishlist)
    expect(mockWishlistService.create).toHaveBeenCalledWith({
      customer_id: "customer_123",
      sales_channel_id: "sc_123",
      title: "My Wishlist",
    })

    // Verify event emission
    expect(mockEventBus.emit).toHaveBeenCalledWith("wishlist.created", {
      id: newWishlist.id,
      customer_id: newWishlist.customer_id,
      sales_channel_id: newWishlist.sales_channel_id,
      title: newWishlist.title,
    })
  })

  it("should handle event bus failure gracefully", async () => {
    mockWishlistService.list.mockResolvedValueOnce([])

    const newWishlist = {
      id: "wishlist_new",
      customer_id: "customer_123",
      sales_channel_id: "sc_123",
      title: "My Wishlist",
    }

    mockWishlistService.create.mockResolvedValueOnce(newWishlist)

    // Mock event bus failure
    mockEventBus.emit.mockRejectedValueOnce(new Error("Event bus error"))

    const input = {
      customer_id: "customer_123",
      sales_channel_id: "sc_123",
      title: "My Wishlist",
    }

    // Should not throw error even if event emission fails
    const result = await createWishlistStep(input, {
      container: mockContainer,
    })

    expect(result).toEqual(newWishlist)
    expect(mockWishlistService.create).toHaveBeenCalled()
  })

  it("should compensate by deleting created wishlist", async () => {
    const compensationData = {
      id: "wishlist_123",
      customer_id: "customer_123",
      sales_channel_id: "sc_123",
      title: "My Wishlist",
    }

    const step = createWishlistStep as any
    if (step.compensate) {
      await step.compensate(compensationData, {
        container: mockContainer,
      })
    }

    expect(mockWishlistService.delete).toHaveBeenCalledWith(["wishlist_123"])
  })

  it("should not compensate if no compensation data", async () => {
    await createWishlistStep.compensate(null, {
      container: mockContainer,
    })

    expect(mockWishlistService.delete).not.toHaveBeenCalled()
  })
})

