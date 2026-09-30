import { Migration } from "@mikro-orm/migrations";

/**
 * REPAIR MIGRATION — product search trigger relation name
 * ────────────────────────────────────────────────────────
 * Fixes: `relation "product_tag_product" does not exist`
 *
 * Observed
 *   POST /admin/products → 500 unknown_error
 *   PostgreSQL: relation "product_tag_product" does not exist
 *   triggered by: insert into "product" (...) values (...)
 *
 * Root cause
 *   Migration20250222SearchEnhancement installed a plpgsql function
 *   `product_searchable_content_trigger()` whose body reads the
 *   Product ↔ ProductTag pivot from a relation named `product_tag_product`.
 *   That relation has never existed in Medusa v2.12.5.
 *
 *   The real pivot is created by the core Product module migration
 *   `@medusajs/product` InitialSetup20240401153642:
 *     create table "product_tags" ("product_id" text, "product_tag_id" text, ...)
 *   and declared in `@medusajs/product` models/product.js as
 *     tags: manyToMany(ProductTag, { mappedBy: "products", pivotTable: "product_tags" })
 *
 *   Because the function is LANGUAGE plpgsql, PostgreSQL does not resolve
 *   relations when the function is created — the original migration applied
 *   cleanly. The function only fails at runtime, on the first INSERT/UPDATE
 *   against `product`, which is why admin login, regions, categories, sales
 *   channels and shipping profiles all still work.
 *
 * Change applied here
 *   Re-create `product_searchable_content_trigger()` with the single corrected
 *   relation name `product_tags` (alias `ptp` and both column references are
 *   already correct for that table). Body is otherwise byte-for-byte identical
 *   in behaviour to the original.
 *
 * Safety
 *   • Additive only. No DROP of any table, column, index or trigger.
 *   • The trigger `trg_product_searchable_content` is NOT dropped or recreated.
 *     `CREATE OR REPLACE FUNCTION` keeps the same function identity, so the
 *     existing trigger stays bound to the corrected body.
 *   • Does not assume Migration20250222SearchEnhancement will ever re-run, and
 *     does not re-apply any of its other statements.
 *   • Idempotent — safe to apply against a database where the function is
 *     already absent or already corrected.
 *   • Touches no region, category, sales channel, shipping profile, customer,
 *     order, price or variant data.
 */
export class Migration20260930090000FixSearchTriggerTable extends Migration {
  async up(): Promise<void> {
    // Re-assert the unaccent extension and its immutable wrapper so this repair
    // is self-contained even if it is applied to a database where the original
    // search migration's earlier statements are absent. Both are idempotent.
    this.addSql(`CREATE EXTENSION IF NOT EXISTS unaccent;`);
    this.addSql(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
    this.addSql(`
      CREATE OR REPLACE FUNCTION f_unaccent(text)
        RETURNS text
        LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
      $func$
        SELECT public.unaccent($1)
      $func$;
    `);

    // ── The repair: same function, corrected pivot relation ───────────────────
    this.addSql(`
      CREATE OR REPLACE FUNCTION product_searchable_content_trigger()
        RETURNS trigger
        LANGUAGE plpgsql AS
      $func$
      DECLARE
        v_type_value     text;
        v_tags           text;
        v_variant_titles text;
        v_variant_skus   text;
      BEGIN
        -- product type
        SELECT pt.value INTO v_type_value
          FROM product_type pt
         WHERE pt.id = NEW.type_id
         LIMIT 1;

        -- tags (concatenated)
        SELECT string_agg(t.value, ' ') INTO v_tags
          FROM product_tags ptp
          JOIN product_tag t ON t.id = ptp.product_tag_id
         WHERE ptp.product_id = NEW.id;

        -- variant titles + skus (concatenated)
        SELECT
          string_agg(pv.title, ' '),
          string_agg(COALESCE(pv.sku,''), ' ')
        INTO v_variant_titles, v_variant_skus
          FROM product_variant pv
         WHERE pv.product_id = NEW.id
           AND pv.deleted_at IS NULL;

        NEW.searchable_content :=
          setweight(to_tsvector('simple',
            f_unaccent(COALESCE(NEW.title, ''))), 'A') ||
          setweight(to_tsvector('simple',
            f_unaccent(COALESCE(v_variant_skus, ''))), 'A') ||
          setweight(to_tsvector('simple',
            f_unaccent(COALESCE(NEW.subtitle, ''))), 'B') ||
          setweight(to_tsvector('simple',
            f_unaccent(COALESCE(v_tags, ''))), 'B') ||
          setweight(to_tsvector('simple',
            f_unaccent(COALESCE(v_type_value, ''))), 'B') ||
          setweight(to_tsvector('simple',
            f_unaccent(COALESCE(v_variant_titles, ''))), 'B') ||
          setweight(to_tsvector('simple',
            f_unaccent(COALESCE(NEW.description, ''))), 'C') ||
          setweight(to_tsvector('simple',
            f_unaccent(COALESCE(NEW.material, ''))), 'D');

        RETURN NEW;
      END
      $func$;
    `);
  }

  async down(): Promise<void> {
    // Deliberately a no-op.
    //
    // Rolling this back would mean re-installing the broken function body that
    // references `product_tag_product`, which would immediately break every
    // INSERT/UPDATE against `product` again. There is no safe reverse for a
    // repair migration, so down() does nothing.
  }
}
