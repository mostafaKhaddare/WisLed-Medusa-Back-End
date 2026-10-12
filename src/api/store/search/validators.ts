import { createFindParams } from '@medusajs/medusa/api/utils/validators';
import { z } from 'zod';

export const StoreSearchProductsParams = createFindParams({
  offset: 0,
  limit: 50
}).merge(
  z.object({
    q: z.string().optional(),
    currency_code: z.string(),
    collection_id: z.array(z.string()).optional(),
    category_id: z.array(z.string()).optional(),
    type_id: z.array(z.string()).optional(),
    materials: z.array(z.string()).optional(),
    // LED spec facets, stored in product.metadata (JSONB).
    color_temperature: z.array(z.string()).optional(),
    wattage: z.array(z.string()).optional(),
    ip_rating: z.array(z.string()).optional(),
    voltage: z.array(z.string()).optional(),
    product_type: z.array(z.string()).optional(),
    strip_width: z.array(z.string()).optional(),
    profile: z.array(z.string()).optional(),
    order: z
      .enum(['relevance', 'calculated_price', '-calculated_price', 'created_at', '-created_at'])
      .default('relevance'),
    price_from: z.coerce.number().optional(),
    price_to: z.coerce.number().optional()
  })
);

export type StoreSearchProductsParamsType = z.infer<typeof StoreSearchProductsParams>;