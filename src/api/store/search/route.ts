import { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { Knex } from "@mikro-orm/knex";
import { StoreSearchProductsParamsType } from "./validators";

/* ============================================================================
   SMART SEARCH ENGINE
   ─────────────────────────────────────────────────────────────────────────────
   Strategy (in priority order):

   1. Accent-stripping          — f_unaccent() on both sides
   2. Full-text tsquery         — plainto_tsquery('simple', ...) for multi-word
   3. Prefix matching           — each token gets :* for partial word match
   4. Fuzzy/trigram fallback    — similarity() for typo tolerance (~0.15 threshold)
   5. Technical keyword aliases — "24v"→"24V DC", "rgb"→"rgb rvb", etc.
   6. Ranking                   — ts_rank * boost for exact prefix matches
   ============================================================================ */

export const GET = async (
  req: MedusaRequest<StoreSearchProductsParamsType>,
  res: MedusaResponse
) => {
  const { limit, offset } = req.validatedQuery as StoreSearchProductsParamsType;
  const knex = req.scope.resolve("__pg_connection__");
  const engine = new SearchEngine(knex);

  const products = await engine.searchProducts(
    req.validatedQuery as StoreSearchProductsParamsType,
    req.listConfig.select
  );

  res.json({
    products: products.map(({ total_count, ...rest }) => rest),
    count: Number(products[0]?.total_count ?? 0),
    limit,
    offset,
  });
};

// ── Lighting domain synonyms ──────────────────────────────────────────────────
// Expands user shorthand to canonical terms so "24v" also hits "24V DC" etc.
const LIGHTING_SYNONYMS: Record<string, string[]> = {
  "led": ["led", "diode"],
  "rgb": ["rgb", "rvb", "multicolore", "couleur"],
  "cct": ["cct", "bicolore", "dual", "temperature", "couleur"],
  "cob": ["cob", "filament"],
  "smd": ["smd", "5050", "2835", "3528", "5630"],
  "5050": ["5050", "smd5050", "smd 5050"],
  "2835": ["2835", "smd2835"],
  "3528": ["3528", "smd3528"],
  "5630": ["5630", "smd5630"],
  "12v": ["12v", "12vdc", "12 v", "basse tension"],
  "24v": ["24v", "24vdc", "24 v", "basse tension"],
  "220v": ["220v", "220vac", "230v", "secteur"],
  "230v": ["230v", "220v", "220vac", "secteur"],
  "dmx": ["dmx", "dmx512"],
  "spi": ["spi", "pixel", "addressable", "adressable", "ws2811", "ws2812"],
  "wifi": ["wifi", "wi-fi", "zigbee", "smart", "connecte"],
  "rf": ["rf", "radiofrequence", "telecommande", "remote"],
  "ip65": ["ip65", "etanche", "waterproof", "outdoor", "exterieur"],
  "ip67": ["ip67", "etanche", "waterproof"],
  "ip68": ["ip68", "submersible", "waterproof"],
  "alu": ["alu", "aluminium", "profile"],
  "ruban": ["ruban", "bande", "strip", "rouleau"],
  "panneau": ["panneau", "panel", "dalle", "plafond"],
  "spot": ["spot", "encastre", "downlight"],
  "ampoule": ["ampoule", "bulb", "e27", "e14", "gu10", "gu5"],
};

function expandQuery(q: string): string {
  const normalized = q
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^\w\s]/g, " ")         // remove punctuation
    .trim();

  const tokens = normalized.split(/\s+/).filter(Boolean);
  const expanded = new Set<string>(tokens);

  for (const token of tokens) {
    const synonyms = LIGHTING_SYNONYMS[token];
    if (synonyms) synonyms.forEach((s) => expanded.add(s));
  }

  return Array.from(expanded).join(" ");
}

// ── Build a prefix-aware tsquery string ──────────────────────────────────────
// "led strip" → "led:* & strip:*"  (matches any word starting with token)
function buildPrefixTsquery(normalizedQ: string): string {
  const tokens = normalizedQ
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `${t}:*`);
  return tokens.join(" & ");
}

class SearchEngine {
  #connection: Knex<any, any[]>;
  #qb: Knex.QueryBuilder;

  constructor(connection: Knex<any, any[]>) {
    this.#connection = connection;
    this.#qb = connection.queryBuilder();
  }

  async searchProducts(
    params: StoreSearchProductsParamsType,
    select: string[]
  ) {
    this.buildBaseQuery(params.currency_code, params.q, select);
    this.applyFiltering(params);
    this.applySorting(params);
    this.applyPagination(params);

    return await this.#qb;
  }

  // ── Sorting ────────────────────────────────────────────────────────────────
  private applySorting({ order, q }: StoreSearchProductsParamsType) {
    if (order === "relevance" && q) {
      // Rank by tsvector relevance, boost exact-prefix matches on title
      this.#qb.orderByRaw(
        `
        (
          ts_rank(product.searchable_content,
            to_tsquery('simple', f_unaccent(?))
          ) * 2.0
          +
          CASE WHEN f_unaccent(lower(product.title)) ILIKE f_unaccent(lower(?)) THEN 1.0 ELSE 0.0 END
        ) DESC,
        product.created_at DESC
        `,
        [buildPrefixTsquery(expandQuery(q)), `%${q}%`]
      );
    } else if (order !== "relevance") {
      const sortingOrder = order.startsWith("-") ? "desc" : "asc";
      const orderBy = order.startsWith("-") ? order.slice(1) : order;
      this.#qb.orderBy(orderBy, sortingOrder);
    } else {
      this.#qb.orderBy("product.created_at", "desc");
    }
  }

  // ── Pagination ─────────────────────────────────────────────────────────────
  private applyPagination({ offset, limit }: StoreSearchProductsParamsType) {
    this.#qb.limit(limit).offset(offset);
  }

  // ── Filtering ──────────────────────────────────────────────────────────────
  private applyFiltering({
    q,
    collection_id,
    type_id,
    materials,
    category_id,
    price_from,
    price_to,
  }: StoreSearchProductsParamsType) {

    if (q && q.trim()) {
      const expandedQ = expandQuery(q);
      const prefixTsquery = buildPrefixTsquery(expandedQ);
      const plainQ = expandedQ;

      // Match strategy: (full-text prefix match) OR (trigram fuzzy on title)
      // Using f_unaccent() on both sides for accent-insensitivity
      this.#qb.where((outer) => {
        outer
          // ① Full-text match against the enhanced tsvector
          .orWhereRaw(
            `product.searchable_content @@ to_tsquery('simple', f_unaccent(?))`,
            [prefixTsquery]
          )
          // ② Trigram fuzzy match on title (handles typos up to ~2 chars)
          .orWhereRaw(
            `f_unaccent(product.title) % f_unaccent(?)`,
            [q]
          )
          // ③ Simple ILIKE fallback (accent-insensitive contains match on title)
          .orWhereRaw(
            `f_unaccent(lower(product.title)) ILIKE f_unaccent(lower(?))`,
            [`%${plainQ}%`]
          );
      });
    }

    if (collection_id) {
      this.#qb.whereIn("product.collection_id", collection_id);
    }

    if (type_id) {
      this.#qb.whereIn("product.type_id", type_id);
    }

    if (materials) {
      this.#qb.whereIn("product.material", materials);
    }

    if (category_id) {
      this.#qb.whereIn("product.id", function () {
        this.select("product_category_product.product_id")
          .from("product_category_product")
          .whereIn("product_category_id", category_id);
      });
    }

    if (price_from) {
      this.#qb.where(
        this.#connection.raw(
          "COALESCE(price_data.sale_price, price_data.regular_price)"
        ),
        ">=",
        price_from
      );
    }

    if (price_to) {
      this.#qb.andWhere("price_data.max_price", "<=", price_to);
    }
  }

  // ── Base query ─────────────────────────────────────────────────────────────
  private buildBaseQuery(currencyCode: string, q: string | undefined, select: string[]) {
    this.#qb
      .with("price_data", (qb) => {
        qb.select(
          "product_variant.product_id",
          this.#connection.raw(
            "MIN(CASE WHEN price_list.type = 'sale' THEN price.amount END) AS sale_price"
          ),
          this.#connection.raw(
            "MIN(CASE WHEN price.price_list_id IS NULL THEN price.amount END) AS regular_price"
          ),
          this.#connection.raw("MAX(price.amount) AS max_price")
        )
          .from("product_variant")
          .innerJoin(
            "product_variant_price_set",
            "product_variant_price_set.variant_id",
            "product_variant.id"
          )
          .innerJoin(
            "price_set",
            "price_set.id",
            "product_variant_price_set.price_set_id"
          )
          .innerJoin("price", function () {
            this.on("price.price_set_id", "=", "price_set.id").andOnIn(
              "price.currency_code",
              [currencyCode]
            );
          })
          .leftJoin("price_list", "price_list.id", "price.price_list_id")
          .whereNull("product_variant.deleted_at")
          .whereNull("product_variant_price_set.deleted_at")
          .whereNull("price_set.deleted_at")
          .whereNull("price.deleted_at")
          .groupBy("product_variant.product_id");
      })
      .select(
        ...select.map((sel) => `product.${sel}`),
        "price_data.regular_price",
        "price_data.sale_price",
        this.#connection.raw(
          "COALESCE(price_data.sale_price, price_data.regular_price) AS calculated_price"
        ),
        this.#connection.raw("COUNT(*) OVER() AS total_count")
      )
      .from("product")
      .leftJoin("price_data", "price_data.product_id", "product.id")
      .where("product.status", "=", "published")
      .whereNull("product.deleted_at");
  }
}
