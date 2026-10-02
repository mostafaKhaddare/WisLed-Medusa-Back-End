import { createReadStream } from 'fs'
import { readdir, stat } from 'fs/promises'
import { join, extname, basename, relative } from 'path'
import { PutObjectCommand, S3Client, HeadObjectCommand } from '@aws-sdk/client-s3'

/**
 * Copy local product media to Sirv over the S3 API.
 *
 * Why this is needed
 * -----------------
 * Product images were uploaded to Medusa while object storage was unconfigured,
 * so they landed on Render's ephemeral disk and Medusa wrote
 * `http://localhost:9000/static/<key>` into the database. Those files no longer
 * exist on the server: every `/static/...` request now returns 404 because a
 * redeploy wiped the filesystem.
 *
 * The original uploads survive only in this repository's `static/` folder, whose
 * filenames use the same timestamp scheme as the dead URLs. This script copies
 * them to Sirv, which is the only remaining source of truth for the media.
 *
 * Why this exists instead of just letting Medusa upload
 * -----------------------------------------------------
 * `@medusajs/file-s3` sends `ACL: public-read` on every PutObject
 * (s3-file.js). Sirv does not implement S3 bucket ACLs and is expected to
 * reject that header. This script deliberately omits it, which sidesteps the
 * problem for the migration. Uploads made through the Medusa admin afterwards
 * still go through the driver and still carry the header, so that path needs
 * its own fix before admin uploads can be trusted.
 *
 * Safety properties
 * -----------------
 *   - Dry run by default. Set APPLY=1 to upload.
 *   - Skips objects already present in the bucket, so it is safe to rerun and
 *     will not re-transfer 199 MB on a second attempt.
 *   - Only image extensions are considered. The product export CSVs sitting in
 *     the same folder are deliberately skipped: they are not media, and they
 *     contain the full catalog.
 *   - Uploads with the exact original filename as the S3 key, so the backfill
 *     can rewrite `.../static/<name>` to `<SIRV_URL>/<name>` with a pure
 *     prefix substitution and no lookup table.
 *   - Nothing is deleted locally, and no database row is touched here.
 *
 * Usage:
 *   pnpm run media:upload
 *   APPLY=1 pnpm run media:upload
 *   SOURCE_DIR=./static pnpm run media:upload
 *   PREFIX=products pnpm run media:upload
 */

const APPLY = process.env.APPLY === '1'
const SOURCE_DIR = process.env.SOURCE_DIR ?? join(process.cwd(), 'static')
const PREFIX = process.env.PREFIX ?? ''
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 8)
// Upload at most N files. Used to validate credentials and connectivity with a
// single object before committing to the full transfer.
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
}

interface Config {
  url: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  region: string
  endpoint: string
}

function readConfig(): Config | null {
  const cfg = {
    url: process.env.SIRV_URL?.replace(/\/+$/, ''),
    accessKeyId: process.env.SIRV_ACCESS_KEY,
    secretAccessKey: process.env.SIRV_SECRET_KEY,
    bucket: process.env.SIRV_BUCKET,
    region: process.env.SIRV_REGION ?? 'sirv',
    endpoint: process.env.SIRV_ENDPOINT ?? 'https://s3.sirv.com',
  }

  const missing = Object.entries(cfg)
    .filter(([k, v]) => !v)
    .map(([k]) => k)

  if (missing.length) {
    console.log(`\n⚠️  Missing: ${missing.join(', ')}`)
    console.log('   Set SIRV_URL, SIRV_ACCESS_KEY, SIRV_SECRET_KEY and SIRV_BUCKET.\n')
    return null
  }
  return cfg as Config
}

async function collectImages(dir: string): Promise<string[]> {
  const out: string[] = []

  async function walk(current: string) {
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (CONTENT_TYPES[extname(entry.name).toLowerCase()]) {
        out.push(full)
      }
    }
  }

  await walk(dir)
  return out.sort()
}

// Distinguishing "absent" from "could not check" matters. If credentials are
// wrong, HeadObject fails with AccessDenied rather than NoSuchKey, and treating
// those the same would report every file as missing and then fail 565 uploads.
let probeError: string | null = null

async function exists(client: S3Client, bucket: string, key: string) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return true
  } catch (e: any) {
    const name = e?.name ?? ''
    if (name === 'NoSuchKey' || name === 'NotFound' || e?.$metadata?.httpStatusCode === 404) {
      return false
    }
    if (!probeError) {
      probeError = e?.name ? `${e.name}: ${e.message}` : String(e)
    }
    throw e
  }
}

async function main() {
  const cfg = readConfig()
  if (!cfg) {
    process.exit(1)
  }

  const allFiles = await collectImages(SOURCE_DIR)
  const files = allFiles.slice(0, Number.isFinite(LIMIT) ? LIMIT : allFiles.length)
  if (!files.length) {
    console.log(`\n❌ No images found under ${SOURCE_DIR}\n`)
    process.exit(1)
  }

  let totalBytes = 0
  const sizes = await Promise.all(files.map((f) => stat(f).then((s) => s.size).catch(() => 0)))
  files.forEach((_, i) => (totalBytes += sizes[i]))

  console.log(`\nSource     : ${SOURCE_DIR}`)
  console.log(`Files      : ${files.length} images (${(totalBytes / 1024 / 1024).toFixed(1)} MB)`)
  console.log(`Bucket     : ${cfg.bucket} @ ${cfg.endpoint}`)
  console.log(`Public URL : ${cfg.url}`)
  console.log(`Mode       : ${APPLY ? 'APPLY' : 'DRY RUN (set APPLY=1 to upload)'}\n`)

  // Sirv only accepts path-style requests. The AWS SDK v3 client would
  // otherwise build virtual-host URLs like https://<bucket>.s3.sirv.com,
  // which does not resolve.
  const client = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: cfg.accessKeyId as string,
      secretAccessKey: cfg.secretAccessKey as string,
    },
  })

  let uploaded = 0
  let skipped = 0
  const failed: { key: string; error: string }[] = []

  // No ACL is set on purpose. Sirv does not support S3 bucket ACLs and rejects
  // the header that @medusajs/file-s3 attaches to its own uploads.
  const runOne = async (file: string, size: number) => {
    const key = `${PREFIX}${basename(file)}`
    try {
      if (await exists(client, cfg.bucket, key)) {
        skipped++
        return
      }
      if (!APPLY) {
        uploaded++
        return
      }
      await client.send(
        new PutObjectCommand({
          Bucket: cfg.bucket,
          Key: key,
          Body: createReadStream(file),
          ContentType: CONTENT_TYPES[extname(file).toLowerCase()],
          ContentLength: size,
        })
      )
      uploaded++
    } catch (e: any) {
      failed.push({ key, error: e?.name ? `${e.name}: ${e.message}` : String(e) })
    }
  }

  // Small bounded pool. Sirv is a CDN rather than a bulk-transfer target, so
  // this deliberately stays modest instead of saturating the connection.
  const queue = files.map((file, i) => ({ file, size: sizes[i] }))
  const workers = Array.from({ length: Math.min(CONCURRENCY, files.length) }, async () => {
    while (queue.length) {
      const next = queue.shift()
      if (next) {
        await runOne(next.file, next.size)
      }
    }
  })
  await Promise.all(workers)

  if (probeError) {
    console.log(`\n❌ Could not read the bucket: ${probeError}`)
    console.log(`   Check SIRV_ACCESS_KEY / SIRV_SECRET_KEY / SIRV_BUCKET.\n`)
    process.exit(1)
  }

  console.log(`\n${APPLY ? 'Uploaded' : 'Would upload'} : ${uploaded}`)
  console.log(`Already present      : ${skipped}`)
  console.log(`Failed               : ${failed.length}`)

  if (failed.length) {
    const shown = failed.slice(0, 5)
    console.log(`\nFirst failures:`)
    shown.forEach((f) => console.log(`  ${f.key}\n    ${f.error}`))
    if (failed.length > shown.length) {
      console.log(`  ... and ${failed.length - shown.length} more`)
    }
  }

  if (APPLY && !failed.length) {
    console.log(`\n✅ All files present in ${cfg.bucket}.`)
    console.log(`   Next: APPLY=1 pnpm run media:backfill`)
  } else if (!APPLY) {
    console.log(`\n   Dry run only. Nothing was written.`)
  }
  console.log()
}

// `medusa exec` requires the script to default-export a callable, so the entry
// point is exported rather than only invoked at module scope.
export default main

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
