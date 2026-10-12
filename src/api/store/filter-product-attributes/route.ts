import { MedusaRequest, MedusaResponse } from "@medusajs/framework";

/**
 * Facets exposed to the storefront, keyed by the URL param the frontend uses.
 *
 * Every LED-specific facet reads from `product.metadata`, because Medusa's
 * product table has no columns for colour temperature, IP rating, wattage,
 * voltage, strip width or profile. Adding those as columns would mean a
 * migration on production, so metadata is the intended home. See
 * docs/WISLED_FILTERS_SETUP.md for the exact keys a product must carry.
 */
const FACETS: { key: string; label: string }[] = [
  { key: "color_temperature", label: "Température de couleur" },
  { key: "wattage", label: "Puissance (W/m)" },
  { key: "ip_rating", label: "Indice de protection (IP)" },
  { key: "voltage", label: "Tension" },
  { key: "product_type", label: "Type de bande LED" },
  { key: "strip_width", label: "Largeur de ruban (mm)" },
  { key: "profile", label: "Profil / diffuseur" },
];

/** Human-friendly ordering for values that sort awkwardly as strings. */
const VALUE_ORDER: Record<string, string[]> = {
  strip_width: ["8", "10", "12", "14", "17", "20", "24"],
};

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    // A single value may be stored as a comma separated list.
    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }
  return [];
}

function sortValues(key: string, values: string[]): string[] {
  const preferred = VALUE_ORDER[key];
  if (!preferred) return values.sort((a, b) => a.localeCompare(b));
  return values.sort((a, b) => {
    const ai = preferred.indexOf(a);
    const bi = preferred.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const knex = req.scope.resolve("__pg_connection__");

  // Optional category scoping: `/store/filter-product-attributes?category_id=…`.
  // Without it the facets are global; with it they describe only the products in
  // that category, which is what lets each category offer its own filter set.
  const categoryId = req.query.category_id as string | undefined;

  let productQuery = knex("product").select("metadata").whereNull("deleted_at");

  if (categoryId) {
    productQuery = productQuery.whereExists(function () {
      this.select(1)
        .from("product_product_category")
        .whereRaw(
          "product_product_category.product_id = product.id"
        )
        .whereIn("product_product_category.product_category_id", [
          categoryId,
        ]);
    });
  }

  const [collection, type, material, metadataRows] = await Promise.all([
    knex("product_collection")
      .select("id", "title as value")
      .whereNull("deleted_at"),
    knex("product_type").select("id", "value").whereNull("deleted_at"),
    knex("product").distinct("material").whereNotNull("material").whereNull("deleted_at"),
    productQuery,
  ]);

  // One pass over the metadata rows collects distinct values for every facet.
  const found: Record<string, Set<string>> = {};
  for (const row of metadataRows) {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    for (const { key } of FACETS) {
      for (const value of toArray(metadata[key])) {
        found[key] ??= new Set();
        found[key].add(value);
      }
    }
  }

  const facets: Record<string, { id: string; value: string }[]> = {};
  for (const { key } of FACETS) {
    facets[key] = sortValues(key, [...(found[key] ?? [])]).map((value) => ({
      id: value,
      value,
    }));
  }

  res.json({
    collection,
    type,
    material: material.map((v: string) => ({ id: v, value: v })),
    // The frontend reads these with `?.` and defaults to an empty list, so a
    // category with no tagged products yields an empty facet rather than a
    // filter group that silently returns nothing.
    ...facets,
  });
};
