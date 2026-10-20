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
    // LED/spec facets, stored in product.metadata (JSONB).
    color: z.array(z.string()).optional(),
    light_color: z.array(z.string()).optional(),
    color_temperature: z.array(z.string()).optional(),
    wattage: z.array(z.string()).optional(),
    wattage_per_metre: z.array(z.string()).optional(),
    power: z.array(z.string()).optional(),
    voltage: z.array(z.string()).optional(),
    roll_length: z.array(z.string()).optional(),
    length: z.array(z.string()).optional(),
    ip_rating: z.array(z.string()).optional(),
    ip: z.array(z.string()).optional(),
    led_type: z.array(z.string()).optional(),
    led_density: z.array(z.string()).optional(),
    density: z.array(z.string()).optional(),
    product_type: z.array(z.string()).optional(),
    strip_width: z.array(z.string()).optional(),
    profile: z.array(z.string()).optional(),
    dimensions: z.array(z.string()).optional(),
    material: z.array(z.string()).optional(),
    finish: z.array(z.string()).optional(),
    installation_type: z.array(z.string()).optional(),
    mounting_type: z.array(z.string()).optional(),
    compatible_accessories: z.array(z.string()).optional(),
    output_wattage: z.array(z.string()).optional(),
    output_voltage: z.array(z.string()).optional(),
    current: z.array(z.string()).optional(),
    output_current: z.array(z.string()).optional(),
    protocol: z.array(z.string()).optional(),
    protocols: z.array(z.string()).optional(),
    compatibility: z.array(z.string()).optional(),
    controller_type: z.array(z.string()).optional(),
    beam_angle: z.array(z.string()).optional(),
    cuttable: z.array(z.string()).optional(),
    order: z
      .enum(['relevance', 'calculated_price', '-calculated_price', 'created_at', '-created_at'])
      .default('relevance'),
    price_from: z.coerce.number().optional(),
    price_to: z.coerce.number().optional()
  })
);

export type StoreSearchProductsParamsType = z.infer<typeof StoreSearchProductsParams>;