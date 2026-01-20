import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaError } from "@medusajs/framework/utils"

jest.setTimeout(60 * 1000)

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer }) => {
    describe("Wishlist API Endpoints", () => {
      let customerId: string
      let salesChannelId: string
      let productId: string
      let variantId: string
      let authToken: string
      let wishlistId: string
      let wishlistItemId: string

      beforeAll(async () => {
        const container = getContainer()
        const query = container.resolve("query")

        // Get or create a sales channel
        const { data: salesChannels } = await query.graph({
          entity: "salesChannel",
          fields: ["id"],
        })
        salesChannelId = salesChannels?.[0]?.id || "sc_01"

        // Create a test customer
        const customerModule = container.resolve("customer")
        const customer = await customerModule.create({
          email: "test@wishlist.com",
          first_name: "Test",
          last_name: "User",
        })
        customerId = customer.id

        // Create a test product with variant
        const productModule = container.resolve("product")
        const product = await productModule.create({
          title: "Test Product",
          handle: "test-product",
        })
        productId = product.id

        const variant = await productModule.createVariants({
          product_id: product.id,
          title: "Test Variant",
          sku: "TEST-VARIANT-001",
        })
        variantId = variant[0].id

        // Create auth token for customer
        const authModule = container.resolve("auth")
        const authProvider = authModule.listAuthProviders()[0]
        const { token } = await authProvider.authenticate({
          entity_id: customerId,
          auth_identity_id: customerId,
        })
        authToken = token
      })

      describe("POST /store/wishlist", () => {
        it("should require authentication", async () => {
          const response = await api.post("/store/wishlist", {
            variant_id: variantId,
          })

          expect(response.status).toBeGreaterThanOrEqual(400)
        })

        it("should require variant_id", async () => {
          const response = await api.post(
            "/store/wishlist",
            {},
            {
              headers: {
                Authorization: `Bearer ${authToken}`,
              },
            }
          )

          expect(response.status).toBeGreaterThanOrEqual(400)
        })

        it("should reject non-existent variant_id", async () => {
          const response = await api.post(
            "/store/wishlist",
            { variant_id: "non-existent-variant-id" },
            {
              headers: {
                Authorization: `Bearer ${authToken}`,
              },
            }
          )

          expect(response.status).toBe(404)
          expect(response.data.message).toContain("not found")
        })

        it("should create wishlist and add item successfully", async () => {
          const response = await api.post(
            "/store/wishlist",
            { variant_id: variantId },
            {
              headers: {
                Authorization: `Bearer ${authToken}`,
                "x-publishable-api-key": "pk_test",
              },
            }
          )

          expect(response.status).toBe(200)
          expect(response.data.wishlist).toBeDefined()
          expect(response.data.wishlist.customer_id).toBe(customerId)
          wishlistId = response.data.wishlist.id
        })

        it("should return existing item when adding duplicate variant", async () => {
          const response = await api.post(
            "/store/wishlist",
            { variant_id: variantId },
            {
              headers: {
                Authorization: `Bearer ${authToken}`,
                "x-publishable-api-key": "pk_test",
              },
            }
          )

          expect(response.status).toBe(200)
          expect(response.data.wishlist.id).toBe(wishlistId)
        })
      })

      describe("GET /store/wishlist", () => {
        it("should require authentication", async () => {
          const response = await api.get("/store/wishlist")

          expect(response.status).toBeGreaterThanOrEqual(400)
        })

        it("should return wishlist with items", async () => {
          const response = await api.get("/store/wishlist", {
            headers: {
              Authorization: `Bearer ${authToken}`,
              "x-publishable-api-key": "pk_test",
            },
          })

          expect(response.status).toBe(200)
          expect(response.data.wishlist).toBeDefined()
          expect(response.data.items).toBeDefined()
          expect(Array.isArray(response.data.items)).toBe(true)
          if (response.data.items.length > 0) {
            wishlistItemId = response.data.items[0].id
          }
        })
      })

      describe("DELETE /store/wishlist/[id]", () => {
        it("should require authentication", async () => {
          const response = await api.delete(`/store/wishlist/${wishlistItemId}`)

          expect(response.status).toBeGreaterThanOrEqual(400)
        })

        it("should delete wishlist item successfully", async () => {
          if (!wishlistItemId) {
            // Create an item first
            await api.post(
              "/store/wishlist",
              { variant_id: variantId },
              {
                headers: {
                  Authorization: `Bearer ${authToken}`,
                  "x-publishable-api-key": "pk_test",
                },
              }
            )
            const getResponse = await api.get("/store/wishlist", {
              headers: {
                Authorization: `Bearer ${authToken}`,
                "x-publishable-api-key": "pk_test",
              },
            })
            wishlistItemId = getResponse.data.items[0]?.id
          }

          if (wishlistItemId) {
            const response = await api.delete(
              `/store/wishlist/${wishlistItemId}`,
              {
                headers: {
                  Authorization: `Bearer ${authToken}`,
                },
              }
            )

            expect(response.status).toBe(200)
            expect(response.data.wishlist).toBeDefined()
          }
        })
      })

      describe("DELETE /store/customers/me/wishlists/items/[id]", () => {
        it("should require authentication", async () => {
          // First create an item
          await api.post(
            "/store/wishlist",
            { variant_id: variantId },
            {
              headers: {
                Authorization: `Bearer ${authToken}`,
                "x-publishable-api-key": "pk_test",
              },
            }
          )

          const getResponse = await api.get("/store/wishlist", {
            headers: {
              Authorization: `Bearer ${authToken}`,
              "x-publishable-api-key": "pk_test",
            },
          })

          const itemId = getResponse.data.items[0]?.id

          if (itemId) {
            const response = await api.delete(
              `/store/customers/me/wishlists/items/${itemId}`
            )

            expect(response.status).toBeGreaterThanOrEqual(400)
          }
        })
      })
    })
  },
})

