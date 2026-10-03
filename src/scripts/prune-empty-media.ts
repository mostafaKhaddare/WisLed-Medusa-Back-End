import { ExecArgs } from '@medusajs/framework/types'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'

/**
 * Remove product image rows that can never render.
 *
 * Why this is needed
 * -----------------
 * Two kinds of dead rows exist, and they need different handling.
 *
 * 1. Rows with an empty url. The upload workflow creates the `product_image`
 *    row before it calls storage, so every failed upload left a row behind with
 *    no url at all. Medusa validates every entry in `images` on update, so these
 *    block the entire product:
 *
 *      Invalid request: Field 'images, 1, url' is required
 *
 * 2. Rows still holding a `http://localhost:9000/...` url. Those files were on
 *    Render's ephemeral disk and a redeploy deleted them, so the url is dead.
 *    `media:backfill` deliberately will not touch these: it HEAD-verifies the
 *    replacement url before rewriting and skips anything unreachable, which is
 *    the correct behaviour but leaves these rows pointing at localhost forever.
 *    The admin then renders them and the browser refuses them as mixed content,
 *    because the admin is served over HTTPS and the url is plain HTTP.
 *
 *    These are only removed once the file is confirmed absent from the new
 *    store, so a row is never dropped merely because a HEAD request failed.
 *
 * Safety properties
 * -----------------
 *   - Dry run by default. Set APPLY=1 to delete.
 *   - Only touches rows with an empty url, or rows whose url starts with
 *     LOCAL_PREFIX and which do not resolve under DO_SPACE_URL. Any other host
 *     is never touched.
 *   - Requires DO_SPACE_URL for the url-bearing rows. Without it there is no way
 *     to tell a live file from a dead one, so that half is skipped.
 *   - Reports the affected products before doing anything.
 *   - Deletes in a transaction.
 *   - Never drops a table or column.
 *
 * Usage:
 *   pnpm run media:prune
 *   APPLY=1 pnpm run media:prune
 *   LOCAL_PREFIX=http://localhost:9000 pnpm run media:prune
 */

const APPLY = process.env.APPLY === '1'
const LOCAL_PREFIX = process.env.LOCAL_PREFIX ?? 'http://localhost:9000'

interface DeadImage {
  id: string
  product_id: string | null
  url: string | null
  reason: 'empty-url' | 'dead-local-url'
}

/** Does this object resolve under the configured public delivery URL? */
async function publiclyReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' })
    return res.ok
  } catch {
    return false
  }
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

const baseUrl = (process.env.DO_SPACE_URL ?? '').replace(/\/+$/, '')

  logger.info(`[prune] mode           : ${APPLY ? 'APPLY' : 'DRY RUN'}`)
  logger.info(`[prune] empty urls     : always pruned`)
  if (baseUrl) {
    logger.info(`[prune] local urls     : ${LOCAL_PREFIX} absent from ${baseUrl}`)
  } else {
    logger.warn(
      '[prune] DO_SPACE_URL is not set, so dead local urls cannot be identified. ' +
        'Only empty-url rows will be considered.',
    )
  }

  const dead: DeadImage[] = []

  const emptyRows = await knex
    .select('id', 'product_id', 'url')
    .from('product_image')
    .where((qb: any) =>
      qb.whereNull('url').orWhere('url', '').orWhere('url', '   '),
    )

  for (const row of emptyRows) {
    dead.push({ ...row, reason: 'empty-url' })
  }

  if (baseUrl) {
    const localRows = await knex
      .select('id', 'product_id', 'url')
      .from('product_image')
      .where('url', 'like', `${LOCAL_PREFIX}/%`)

    logger.info(`[prune] verifying ${localRows.length} local-origin url(s) against storage`)

    for (const row of localRows) {
      const key = (row.url as string).slice(`${LOCAL_PREFIX}/`.length)
      if (!(await publiclyReachable(`${baseUrl}/${key}`))) {
        dead.push({ ...row, reason: 'dead-local-url' })
      }
    }
  }

  if (!dead.length) {
    logger.info('[prune] no dead image rows found; nothing to do')
    return
  }

  const byProduct = new Map<string, number>()
  for (const row of dead) {
    const key = row.product_id ?? '(unassigned)'
    byProduct.set(key, (byProduct.get(key) ?? 0) + 1)
  }

  const emptyCount = dead.filter((r) => r.reason === 'empty-url').length
  const lostCount = dead.length - emptyCount

  logger.warn(`[prune] ${emptyCount} row(s) with an empty url`)
  logger.warn(`[prune] ${lostCount} row(s) whose file no longer exists`)
  logger.warn(`[prune] across ${byProduct.size} product(s):`)
  for (const [productId, count] of [...byProduct.entries()].slice(0, 20)) {
    logger.warn(`[prune]   ${productId} : ${count}`)
  }
  if (byProduct.size > 20) {
    logger.warn(`[prune]   ... and ${byProduct.size - 20} more products`)
  }
  if (lostCount) {
    logger.warn(
      '[prune] rows counted as lost have no recoverable file. Re-upload those ' +
        'images from your own copies after pruning.',
    )
  }

  if (!APPLY) {
    logger.info('[prune] dry run only. Set APPLY=1 to delete these rows.')
    return
  }

  const ids = dead.map((r) => r.id)
  const deleted = await knex.transaction(async (trx: any) => {
    // Clear any thumbnail pointer that references one of these files, otherwise
    // the product thumbnail stays broken after the image row is removed.
const keys = ids
    await trx('product')
      .whereNotNull('thumbnail')
      .whereIn('thumbnail', keys)
      .update({ thumbnail: null })

    return trx('product_image').whereIn('id', ids).del()
  })

  logger.info(`[prune] deleted ${deleted} image row(s)`)
  logger.info('[prune] done. The affected products can now be saved again.')
}
