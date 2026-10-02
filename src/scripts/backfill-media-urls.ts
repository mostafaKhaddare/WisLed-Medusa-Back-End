import path from 'path'

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
 * Enabling Spaces does NOT fix these. The URLs are persisted in
 * `product_image.url` and `product.thumbnail`, so they keep pointing at the
 * storefront's own machine long after storage is configured correctly. Every
 * product image then 404s, which looks like an image problem but is stale data.
 *
 * Safety properties
 * -----------------
 *   - Dry run by default. Pass `--apply` to write.
 *   - Only rows whose URL starts with the local origin are ever considered.
 *     Rows with any other host are left completely alone.
 *   - Every candidate object is verified to EXIST in the bucket before its row
 *     is updated. A URL is never rewritten to point at a missing object, which
 *     would convert a clearly-wrong URL into a subtler one.
 *   - Idempotent: rerunning after a successful migration matches zero rows.
 *   - No schema changes and no destructive operations. UPDATEs only.
 *
 * Order matters: the files must already be uploaded to the bucket first, or
 * every row will be reported as skipped.
 *
 * Usage:
 *   node --import tsx src/scripts/backfill-media-urls.ts
 *   node --import tsx src/scripts/backfill-media-urls.ts --apply
 *   LOCAL_PREFIX=http://localhost:9000/static node --import tsx \
 *     src/scripts/backfill-media-urls.ts --apply
 */

const APPLY = process.argv.includes('--apply')

/** The prefix that identifies rows produced by the local disk provider. */
const LOCAL_PREFIX = process.env.LOCAL_PREFIX ?? 'http://localhost:9000'

interface StorageEnv {
  DO_SPACE_URL?: string
  DO_SPACE_ACCESS_KEY?: string
  DO_SPACE_SECRET_KEY?: string
  DO_SPACE_BUCKET?: string
  DO_SPACE_REGION?: string
}

interface Row {
  table: 'product_image' | 'product'
  id: string
  column: string
  url: string
  key: string
}

async function main(): Promise<void> {
  // Loaded manually rather than via dotenv so this runs identically in the
  // repo and inside a one-off node invocation.
  const { loadEnv } = await import('@medusajs/framework/utils')
  loadEnv(process.env.NODE_ENV || 'development', process.cwd())

  const env = process.env as StorageEnv

  const missing = (
    ['DO_SPACE_URL', 'DO_SPACE_ACCESS_KEY', 'DO_SPACE_SECRET_KEY', 'DO_SPACE_BUCKET', 'DO_SPACE_REGION'] as const
  ).filter((k) => !env[k])

  if (missing.length > 0) {
    console.error(`[backfill] Missing storage env vars: ${missing.join(', ')}`)
    console.error('[backfill] Cannot verify objects, so refusing to rewrite any URL.')
    process.exit(1)
  }

  const { Client } = await import('pg')
  const { S3Client, HeadObjectCommand } = await import('@aws-sdk/client-s3')

  const baseUrl = (env.DO_SPACE_URL as string).replace(/\/+$/, '')
  const bucket = env.DO_SPACE_BUCKET as string

  const s3 = new S3Client({
    region: env.DO_SPACE_REGION,
    endpoint: `https://${env.DO_SPACE_REGION}.digitaloceanspaces.com`,
    forcePathStyle: false,
    credentials: {
      accessKeyId: env.DO_SPACE_ACCESS_KEY as string,
      secretAccessKey: env.DO_SPACE_SECRET_KEY as string,
    },
  })

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
  })
  await client.connect()

  console.log(`[backfill] target    : ${baseUrl}/${bucket}`)
  console.log(`[backfill] match     : urls starting with ${LOCAL_PREFIX}`)
  console.log(`[backfill] mode      : ${APPLY ? 'APPLY' : 'DRY RUN'}\n`)

  // Only operate on tables/columns that actually exist, so this stays safe
  // across schema variations.
  const rows: Row[] = []

  const hasImageTable = await client.query(`
    select 1 from information_schema.tables
    where table_schema='public' and table_name='product_image'`)

  if (hasImageTable.rowCount) {
    const r = await client.query(
      `select id::text as id, url from product_image where url like $1`,
      [`${LOCAL_PREFIX}%`],
    )
    for (const row of r.rows) {
      rows.push({ table: 'product_image', id: row.id, column: 'url', url: row.url, key: row.url })
    }
  }

  const hasThumb = await client.query(`
    select 1 from information_schema.columns
    where table_schema='public' and table_name='product' and column_name='thumbnail'`)
  if (hasThumb.rowCount) {
    const r = await client.query(
      `select id::text as id, thumbnail as url from product where thumbnail like $1`,
      [`${LOCAL_PREFIX}%`],
    )
    for (const row of r.rows) {
      rows.push({ table: 'product', id: row.id, column: 'thumbnail', url: row.url, key: row.url })
    }
  }

  console.log(`[backfill] rows matching: ${rows.length}\n`)

  if (rows.length === 0) {
    console.log('[backfill] Nothing to do.')
    await client.end()
    return
  }

  // Map a stored URL to its bucket key. Medusa's S3 provider stores objects at
  // the path following /static/, under an optional prefix.
  const toKey = (url: string): string | null => {
    const m = url.match(/\/static\/(.+)$/)
    return m ? m[1] : null
  }

  let updated = 0
  let missingObject = 0
  let unparsable = 0
  const skipped: string[] = []

  for (const row of rows) {
    const key = toKey(row.url)
    if (!key) {
      unparsable++
      console.log(`  UNPARSED  ${row.table}.${row.id}: ${row.url}`)
      continue
    }

    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    } catch {
      missingObject++
      if (skipped.length < 15) {
        skipped.push(`  MISSING   ${row.table}.${row.id}: key not in bucket -> ${key}`)
      }
      continue
    }

    const next = `${baseUrl}/${key}`
    if (row.url === next) {
      continue
    }

    if (APPLY) {
      const col = row.column === 'url' ? 'url' : 'thumbnail'
      await client.query(
        `update ${row.table} set ${col} = $1 where id = $2`,
        [next, row.id],
      )
    }
    updated++
    if (updated <= 15) {
      console.log(`  ${APPLY ? 'updated' : 'would update'}  ${row.table}.${row.id}: ${row.url}\n                 -> ${next}`)
    }
  }

  console.log(`\n[backfill] ${APPLY ? 'updated' : 'would update'} : ${updated}`)
  console.log(`[backfill] skipped (object absent in bucket) : ${missingObject}`)
  console.log(`[backfill] skipped (url unparsable)          : ${unparsable}`)

  if (skipped.length) {
    console.log('\n[backfill] sample skips:')
    for (const s of skipped) console.log(s)
    if (missingObject > skipped.length) {
      console.log(`  ... and ${missingObject - skipped.length} more`)
    }
  }

  if (!APPLY) {
    console.log('\n[backfill] Dry run. Re-run with --apply to write these changes.')
  } else if (missingObject > 0) {
    console.log(
      '\n[backfill] Some rows were skipped because the file is not in the ' +
        'bucket. Upload those files first, then rerun — this script is idempotent.',
    )
  }

  await client.end()
}

main().catch((err) => {
  console.error('[backfill] FAILED:', err)
  process.exit(1)
})