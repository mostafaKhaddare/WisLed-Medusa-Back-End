import { WISHLIST_MODULE } from "../../../../../src/modules/wishlist/index"
import WishlistModuleService from "../../../../../src/modules/wishlist/service"

describe("WishlistModuleService", () => {
  describe("getWishlistsOfVariants", () => {
    let service: WishlistModuleService
    let mockContainer: any
    let mockQuery: any

    beforeEach(() => {
      mockQuery = {
        graph: jest.fn(),
      }

      mockContainer = {
        resolve: jest.fn((name: string) => {
          if (name === "query") {
            return mockQuery
          }
          if (name === WISHLIST_MODULE) {
            return service
          }
          return null
        }),
      }

      service = new WishlistModuleService(mockContainer)
    })

    it("should return empty object for empty variant IDs array", async () => {
      const result = await service.getWishlistsOfVariants([], mockContainer)

      expect(result).toEqual({})
      expect(mockQuery.graph).not.toHaveBeenCalled()
    })

    it("should return counts for variants with wishlist items", async () => {
      const variantIds = ["variant_1", "variant_2", "variant_3"]

      mockQuery.graph.mockResolvedValue({
        data: [
          { product_variant_id: "variant_1" },
          { product_variant_id: "variant_1" },
          { product_variant_id: "variant_2" },
          { product_variant_id: "variant_3" },
          { product_variant_id: "variant_3" },
          { product_variant_id: "variant_3" },
        ],
      })

      const result = await service.getWishlistsOfVariants(
        variantIds,
        mockContainer
      )

      expect(result).toEqual({
        variant_1: 2,
        variant_2: 1,
        variant_3: 3,
      })

      expect(mockQuery.graph).toHaveBeenCalledWith({
        entity: "wishlistItem",
        fields: ["product_variant_id"],
        filters: {
          product_variant_id: { $in: variantIds },
        },
      })
    })

    it("should return zero counts for variants with no wishlist items", async () => {
      const variantIds = ["variant_1", "variant_2"]

      mockQuery.graph.mockResolvedValue({
        data: [],
      })

      const result = await service.getWishlistsOfVariants(
        variantIds,
        mockContainer
      )

      expect(result).toEqual({
        variant_1: 0,
        variant_2: 0,
      })
    })

    it("should throw error if query service is not available", async () => {
      const serviceWithoutContainer = new WishlistModuleService(null as any)

      await expect(
        serviceWithoutContainer.getWishlistsOfVariants(["variant_1"], null)
      ).rejects.toThrow("Query service not available")
    })

    it("should filter out items for variants not in the input array", async () => {
      const variantIds = ["variant_1", "variant_2"]

      mockQuery.graph.mockResolvedValue({
        data: [
          { product_variant_id: "variant_1" },
          { product_variant_id: "variant_2" },
          { product_variant_id: "variant_other" }, // Should be ignored
        ],
      })

      const result = await service.getWishlistsOfVariants(
        variantIds,
        mockContainer
      )

      expect(result).toEqual({
        variant_1: 1,
        variant_2: 1,
      })
    })
  })
})

