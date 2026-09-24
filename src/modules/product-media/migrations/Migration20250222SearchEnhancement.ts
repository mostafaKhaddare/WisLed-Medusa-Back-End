import { Migration } from "@mikro-orm/migrations";

/**
 * SEARCH ENHANCEMENT MIGRATION
 * ─────────────────────────────────────────────────────────────────────────────
 * Enables:
 *   1. unaccent     — accent-insensitive search (e.g. "panneau" matches "panneau")
 *   2. pg_trgm      — trigram fuzzy search (typo-tolerant, partial match)
 *   3. Rebuilt tsvector on `product` with:
 *        - title (weight A)
 *        - subtitle (weight B)
 *        - description (weight C)
 *        - tags (weight B)
 *        - type (weight B)
 *        - variant titles (weight B)  ← NEW
 *        - variant SKUs (weight A)    ← NEW
 *        - metadata text values (weight D) ← NEW
 *   4. GIN index on the new tsvector
 *   5. GIN trigram index on unaccented title (fast LIKE/ILIKE)
 *   6. A trigger to keep tsvector auto-updated on every product change
 * ─────────────────────────────────────────────────────────────────────────────
 */
export class Migration20250222SearchEnhancement extends Migration {
    async up(): Promise<void> {
        // ── 1. Extensions ──────────────────────────────────────────────────────
        this.addSql(`CREATE EXTENSION IF NOT EXISTS unaccent;`);
        this.addSql(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);

        // Create an immutable wrapper so unaccent can be used inside indexes
        this.addSql(`
      CREATE OR REPLACE FUNCTION f_unaccent(text)
        RETURNS text
        LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
      $func$
        SELECT public.unaccent($1)
      $func$;
    `);

        // ── 2. Drop old column + index if they exist ───────────────────────────
        this.addSql(`
      DROP INDEX IF EXISTS product_searchable_content_idx;
    `);
        this.addSql(`
      ALTER TABLE product DROP COLUMN IF EXISTS searchable_content;
    `);

        // ── 3. Add a fresh tsvector column ──────────────────────────────────────
        this.addSql(`
      ALTER TABLE product ADD COLUMN IF NOT EXISTS searchable_content tsvector;
    `);

        // ── 4. Trigger function — rebuilds tsvector on every product upsert ─────
        //
        // Gathers data from:
        //   • product.title, subtitle, description, material
        //   • product_type.value (joined)
        //   • product_tag via product_tag_product (joined, aggregated)
        //   • product_variant.title, sku (joined, aggregated)
        //
        // All text is passed through f_unaccent() before indexing so queries
        // that use f_unaccent() on the query side will match correctly.
        // -------------------------------------------------------------------------
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
          FROM product_tag_product ptp
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

        // Attach trigger to product table
        this.addSql(`
      DROP TRIGGER IF EXISTS trg_product_searchable_content ON product;
      CREATE TRIGGER trg_product_searchable_content
        BEFORE INSERT OR UPDATE ON product
        FOR EACH ROW EXECUTE FUNCTION product_searchable_content_trigger();
    `);

        // ── 5. Back-fill existing products ──────────────────────────────────────
        this.addSql(`
      UPDATE product p SET title = p.title WHERE p.deleted_at IS NULL;
    `);

        // ── 6. GIN index on tsvector (fast full-text search) ───────────────────
        this.addSql(`
      CREATE INDEX IF NOT EXISTS product_searchable_content_gin_idx
        ON product USING GIN (searchable_content);
    `);

        // ── 7. GIN trigram index on unaccented title (fuzzy / partial LIKE) ─────
        this.addSql(`
      CREATE INDEX IF NOT EXISTS product_title_trgm_idx
        ON product USING GIN (f_unaccent(title) gin_trgm_ops);
    `);

        // ── 8. Partial index on published products only (improves query perf) ───
        this.addSql(`
      CREATE INDEX IF NOT EXISTS product_status_published_idx
        ON product (id)
       WHERE status = 'published' AND deleted_at IS NULL;
    `);
    }

    async down(): Promise<void> {
        this.addSql(`DROP TRIGGER IF EXISTS trg_product_searchable_content ON product;`);
        this.addSql(`DROP FUNCTION IF EXISTS product_searchable_content_trigger();`);
        this.addSql(`DROP FUNCTION IF EXISTS f_unaccent(text);`);
        this.addSql(`DROP INDEX IF EXISTS product_searchable_content_gin_idx;`);
        this.addSql(`DROP INDEX IF EXISTS product_title_trgm_idx;`);
        this.addSql(`DROP INDEX IF EXISTS product_status_published_idx;`);
        this.addSql(`ALTER TABLE product DROP COLUMN IF EXISTS searchable_content;`);
    }
}
