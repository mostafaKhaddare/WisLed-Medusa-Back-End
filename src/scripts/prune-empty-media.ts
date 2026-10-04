import { ExecArgs } from '@medusajs/framework/types'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'

/**
 * Remove product_image rows that have no url at all.
 *
 * Why this is needed
 * -----------------
 * Medusa creates the `product_image` row before it hands the bytes to storage.
 * Every upload that fails therefore leaves a row behind with a null url, and
 * Medusa validates every entry in `images` on the next product update:
 *
 *   POST /admin/uploads              -> 500
 *   POST /admin/products/prod_...    -> 400  Field 'images, 1, url' is required
 *
 * So one failed upload does not just fail, it makes the product unsaveable
 * until the row is gone. This clears those rows so the product can be opened
 * and edited again.
 *
 * Scope, deliberately narrow
 * -------------------------
 * Only rows whose url is null, empty or whitespace are touched. Rows carrying
 * any url are left completely alone, including `http://localhost:9000/...`
 * ones: those are the expected shape of local file storage and are not
 * preventing anything from saving.
 *
 * Safety properties
 * -----------------
 *   - Dry run by default. Set APPLY=1 to delete.
 *   - Never touches products, categories, variants, orders or customers. It
 *     only deletes rows from `product_image` that have no url to render.
 *   - Any `product.thumbnail` pointing at a deleted row is cleared, so the
 *     product does not keep a thumbnail reference to a missing image.
 *   - Reports the affected products before doing anything.
 *   - Deletes inside a transaction. No schema change, no migration.
 *   - Idempotent: a second run finds nothing.
 *
 * This is a one-time repair. Once the affected products are saved with a
 * working image, this script and its package.json entry can be deleted.
 *
 * Usage:
 *   pnpm run media:prune
 *   APPLY=1 pnpm run media:prune
 */

const APPLY = process.env.APPLY === '1'

interface EmptyImage {
  id: string
  product_id: string | null
  url: string | null
}

export default async function pruneEmptyMedia({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION, {
    allowUnregistered: true,
  })

  if (!knex) {
    throw new Error(
      'Could not resolve a database connection from the Medusa container. ' +
        'Run this through `medusa exec` so the container is booted.'
    )
  }

  const rows: EmptyImage[] = await knex
    .select('id', 'product_id', 'url')
    .from('product_image')
    .where((qb: any) => qb.whereNull('url').orWhere('url', '').orWhere('url', '   '))

  logger.info(`[prune] mode   : ${APPLY ? 'APPLY' : 'DRY RUN'}`)
  logger.info(`[prune] found  : ${rows.length} image row(s) with no url`)

  if (rows.length === 0) {
    logger.info('[prune] nothing to do')
    return
  }

  const byProduct = new Map<string, number>()
  for (const row of rows) {
    const key = row.product_id ?? '(unassigned)'
    byProduct.set(key, (byProduct.get(key) ?? 0) + 1)
  }

  logger.warn(`[prune] across ${byProduct.size} product(s):`)
  for (const [productId, count] of [...byProduct.entries()].slice(0, 20)) {
    logger.warn(`[prune]   ${productId} : ${count}`)
  }
  if (byProduct.size > 20) {
    logger.warn(`[prune]   ... and ${byProduct.size - 20} more`)
  }

  if (!APPLY) {
    logger.info('[prune] dry run only. Re-run with APPLY=1 to delete these rows.')
    return
  }

  const ids = rows.map((r) => r.id)

  const deleted = await knex.transaction(async (trx: any) => {
    // A thumbnail holding one of these ids would keep pointing at a row that no
    // longer exists, so clear it rather than leave a dangling reference.
    const cleared = await trx('product')
      .whereNotNull('thumbnail')
      .whereIn('thumbnail', ids)
      .update({ thumbnail: null })

    const removed = await trx('product_image').whereIn('id', ids).del()

    logger.info(`[prune] cleared ${cleared} thumbnail pointer(s)`)
    return removed
  })

  logger.info(`[prune] deleted ${deleted} image row(s)`)
  logger.info('[prune] done. The affected products can now be saved again.')
}