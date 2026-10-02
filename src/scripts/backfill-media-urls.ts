import { ExecArgs } from '@medusajs/framework/types'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'

/**
 * Repoint product media URLs at object storage.
 *
 * Why this is needed
 * -----------------
 * While object storage was unconfigured, Medusa fell back to its local disk
 * provider and wrote absolute URLs into the database at upload time:
 *
 *   http://localhost:9000/static/<key>
 *
 * Enabling object storage does NOT fix these. The URLs are persisted in
 * `product_image.url` and `product.thumbnail`, so they keep pointing at the
 * storefront's own machine long after storage is configured correctly. Every
 * product image then fails to load, which looks like an image problem but is
 * stale data.
 *
 * Safety properties
 * -----------------
 *   - Dry run by default. Set APPLY=1 to write.
 *   - Only rows whose URL starts with the local origin are considered. Rows
 *     with any other host are left completely untouched.
 *   - Every candidate is verified with an HTTP HEAD against its *public* URL
 *     before its row is rewritten, so a URL is never repointed at a file that
 *     cannot actually be fetched. This deliberately tests the same public URL
 *     the storefront will request, rather than a privileged S3 API call, so a
 *     private bucket is reported as a failure instead of passing silently.
 *   - Idempotent: rerunning after a successful migration matches zero rows.
 *   - No schema changes, no migrations, no destructive operations. UPDATE only.
 *
 * Ordering matters: upload the files to the bucket first, or every row is
 * reported as skipped.
 *
 * Usage:
 *   pnpm run media:backfill
 *   APPLY=1 pnpm run media:backfill
 *   LOCAL_PREFIX=http://localhost:9000 pnpm run media:backfill
 */

const APPLY = process.env.APPLY === '1'
const LOCAL_PREFIX = process.env.LOCAL_PREFIX ?? 'http://localhost:9000'

interface Row {
  table: 'product_image' | 'product'
  id: string
  column: 'url' | 'thumbnail'
  url: string
  key: string | null
}

/** Does this object resolve over the public URL? */
async function publiclyReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' })
    return res.ok
  } catch {
    return false
  }
}

export default async function backfillMediaUrls({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  const missing = (
    ['DO_SPACE_URL', 'DO_SPACE_BUCKET'] as const
  ).filter((k) => !process.env[k])

  if (missing.length > 0) {
    logger.error(
      `[backfill] Missing required env vars: ${missing.join(', ')}. ` +
        'Cannot determine the target base URL.',
    )
    throw new Error('Storage is not configured; refusing to rewrite any URL.')
  }

  const baseUrl = (process.env.DO_SPACE_URL as string).replace(/\/+$/, '')

  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION, {
    allowUnregistered: true,
  })

  if (!knex) {
    throw new Error(
      'Could not resolve a database connection from the Medusa container. ' +
        'Run this through `medusa exec` so the container is booted.',
    )
  }

  logger.info(`[backfill] target : ${baseUrl}`)
  logger.info(`[backfill] match  : urls starting with ${LOCAL_PREFIX}`)
  logger.info(`[backfill] mode   : ${APPLY ? 'APPLY' : 'DRY RUN'}`)

  const rows: Row[] = []

  const imageRows = await knex
    .select('id', 'url')
    .from('product_image')
    .where('url', 'like', `${LOCAL_PREFIX}%`)

  for (const r of imageRows) {
    rows.push({
      table: 'product_image',
      id: String(r.id),
      column: 'url',
      url: r.url,
      key: r.url.match(/\/static\/(.+)$/)?.[1] ?? null,
    })
  }

  const hasThumbnail = await knex.schema.hasColumn('product', 'thumbnail')
  if (hasThumbnail) {
    const thumbRows = await knex
      .select('id', 'thumbnail')
      .from('product')
      .where('thumbnail', 'like', `${LOCAL_PREFIX}%`)

    for (const r of thumbRows) {
      rows.push({
        table: 'product',
        id: String(r.id),
        column: 'thumbnail',
        url: r.thumbnail,
        key: r.thumbnail?.match(/\/static\/(.+)$/)?.[1] ?? null,
      })
    }
  }

  logger.info(`[backfill] rows matching: ${rows.length}`)

  if (rows.length === 0) {
    logger.info('[backfill] Nothing to do.')
    return
  }

  let updated = 0
  let unreachable = 0
  let unparsable = 0
  const samples: string[] = []

  for (const row of rows) {
    if (!row.key) {
      unparsable++
      logger.warn(`[backfill] UNPARSED ${row.table}.${row.id}: ${row.url}`)
      continue
    }

    const next = `${baseUrl}/${row.key}`

    if (row.url === next) {
      continue
    }

    // Verify the public URL resolves before repointing anything at it.
    if (!(await publiclyReachable(next))) {
      unreachable++
      if (samples.length < 12) {
        samples.push(`  MISSING  ${row.table}.${row.id}: ${next}`)
      }
      continue
    }

    if (APPLY) {
      await knex(row.table).where('id', row.id).update({ [row.column]: next })
    }

    updated++
    if (samples.length < 12) {
      samples.push(
        `  ${APPLY ? 'updated' : 'would update'}  ${row.table}.${row.id}\n` +
          `      ${row.url}\n   -> ${next}`,
      )
    }
  }

  logger.info(`[backfill] ${APPLY ? 'updated' : 'would update'} : ${updated}`)
  logger.info(`[backfill] skipped (not reachable at target URL) : ${unreachable}`)
  logger.info(`[backfill] skipped (url unparsable)               : ${unparsable}`)

  for (const s of samples) {
    logger.info(s)
  }

  if (!APPLY) {
    logger.info('[backfill] Dry run. Re-run with APPLY=1 to write these changes.')
  } else if (unreachable > 0) {
    logger.warn(
      '[backfill] Some rows were skipped because the file is not publicly ' +
        'reachable at its target URL. Upload those files first, then rerun — ' +
        'this script is idempotent.',
    )
  }
}
