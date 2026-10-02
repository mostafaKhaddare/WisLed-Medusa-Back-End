import { ExecArgs } from '@medusajs/framework/types'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'

/**
 * Remove product image rows that have no URL.
 *
 * Why this is needed
 * -----------------
 * The upload workflow creates the `product_image` row before it calls storage.
 * While object storage was unconfigured, and again while the Sirv credential
 * path was failing, the upload returned 500 but the row survived with an empty
 * `url`.
 *
 * Those rows then block the product entirely. Medusa validates every entry in
 * `images` on update, so the admin cannot save any edit to that product:
 *
 *   Invalid request: Field 'images, 1, url' is required
 *
 * The row cannot be repaired because the underlying upload never produced a
 * file, so the only options were to delete the row or re-upload. Deleting is
 * safe: an empty `url` renders as a broken image anyway.
 *
 * Safety properties
 * -----------------
 *   - Dry run by default. Set APPLY=1 to delete.
 *   - Only touches rows where `url` is NULL or blank. Rows with a URL, including
 *     ones still pointing at the old local origin, are never touched. Repointing
 *     those is `media:backfill`'s job, not this script's.
 *   - Reports the affected products before doing anything, so the blast radius
 *     is visible in the dry run.
 *   - Deletes in a transaction.
 *   - Never drops a table or column.
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
        'Run this through `medusa exec` so the container is booted.',
    )
  }

  logger.info(`[prune] mode : ${APPLY ? 'APPLY' : 'DRY RUN'}`)

  const empties: EmptyImage[] = await knex
    .select('id', 'product_id', 'url')
    .from('product_image')
    .where((qb: any) =>
      qb.whereNull('url').orWhere('url', '').orWhere('url', '   '),
    )

  if (!empties.length) {
    logger.info('[prune] no image rows without a url; nothing to do')
    return
  }

  const byProduct = new Map<string, number>()
  for (const row of empties) {
    const key = row.product_id ?? '(unassigned)'
    byProduct.set(key, (byProduct.get(key) ?? 0) + 1)
  }

  logger.warn(`[prune] found ${empties.length} image row(s) with no url`)
  logger.warn(`[prune] across ${byProduct.size} product(s):`)
  for (const [productId, count] of [...byProduct.entries()].slice(0, 20)) {
    logger.warn(`[prune]   ${productId} : ${count}`)
  }
  if (byProduct.size > 20) {
    logger.warn(`[prune]   ... and ${byProduct.size - 20} more products`)
  }

  if (!APPLY) {
    logger.info('[prune] dry run only. Set APPLY=1 to delete these rows.')
    return
  }

  const ids = empties.map((r) => r.id)
  const deleted = await knex.transaction(async (trx: any) => {
    // Clear any thumbnail pointer that references one of these files, otherwise
    // the product thumbnail stays broken after the image row is removed.
    const keys = empties.map((r) => r.id)
    await trx('product')
      .whereNotNull('thumbnail')
      .whereIn('thumbnail', keys)
      .update({ thumbnail: null })

    return trx('product_image').whereIn('id', ids).del()
  })

  logger.info(`[prune] deleted ${deleted} image row(s)`)
  logger.info('[prune] done. The affected products can now be saved again.')
}

declare module '@medusajs/framework/types' {
  interface ExecArgs {
    container: any
  }
}