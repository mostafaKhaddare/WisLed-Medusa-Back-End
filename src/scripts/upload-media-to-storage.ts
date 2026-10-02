import { createReadStream } from 'fs'
import { readdir, stat } from 'fs/promises'
import { join, extname, basename, relative } from 'path'
import { PutObjectCommand, S3Client, HeadObjectCommand } from '@aws-sdk/client-s3'

/**
 * Copy local product media to object storage over the S3 API.
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
 * them to object storage, which is the only remaining source of truth for the
 * media.
 *
 * Provider support
 * ----------------
 * Works against any S3-compatible store. Config is read from the same
 * `DO_SPACE_*` names the running app uses, so the Render environment block can
 * be pasted here verbatim.
 *
 *   - Backblaze B2: no `DO_SPACE_ENDPOINT` needed; the SDK resolves it from the
 *     region. Public bucket, free egress.
 *   - Sirv: requires `DO_SPACE_ENDPOINT=https://s3.sirv.com`, and its CDN only
 *     serves files uploaded through its own web interface. Files written here
 *     store successfully but are rejected at request time by Sirv's imaging
 *     engine with "No image metadata available", so Sirv is not usable as the
 *     upload backend for Medusa.
 *
 * Safety properties
 * -----------------
 *   - Dry run by default. Set APPLY=1 to upload.
 *   - Skips objects already present in the bucket, so it is safe to rerun and
 *     will not re-transfer 199 MB on a second attempt.
 *   - Streams each file and sets ContentLength explicitly. Sirv's signature
 *     validation rejects the request when the SDK is free to choose its own
 *     payload encoding, which it does for in-memory bodies.
 *   - Only image extensions are considered. The product export CSVs sitting in
 *     the same folder are deliberately skipped: they are not media, and they
 *     contain the full catalog.
 *   - Uploads with the exact original filename as the S3 key, so the backfill
 *     can rewrite `.../static/<name>` to `<url>/<name>` with a pure prefix
 *     substitution and no lookup table.
 *   - Nothing is deleted locally, and no database row is touched here.
 *
 * Usage:
 *   pnpm run media:upload
 *   APPLY=1 pnpm run media:upload
 *   LIMIT=1 APPLY=1 pnpm run media:upload    # validate a single object first
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

/**
 * Object storage configuration.
 *
 * Reads the same `DO_SPACE_*` names the Medusa app itself uses, so the block can
 * be pasted verbatim from Render into a local `.env` and the two environments
 * cannot drift. The `SIRV_*` names are accepted as a fallback for older local
 * setups.
 *
 * `endpoint` is optional: omitting it lets the AWS SDK resolve the correct S3
 * endpoint from the region, which is what Backblaze B2 and AWS both want. It is
 * required for providers that are not AWS, such as Sirv at s3.sirv.com.
 *
 * `forcePathStyle` defaults to on. Path-style URLs are accepted by B2 and are
 * mandatory for Sirv, so the default is the portable one.
 */
function readConfig(): Config | null {
  const pick = (name: string) => process.env[`DO_SPACE_${name}`] || process.env[`SIRV_${name}`]

  const cfg = {
    url: pick('URL')?.replace(/\/+$/, ''),
    accessKeyId: pick('ACCESS_KEY'),
    secretAccessKey: pick('SECRET_KEY'),
    bucket: pick('BUCKET'),
    region: pick('REGION'),
    endpoint: process.env.DO_SPACE_ENDPOINT || process.env.SIRV_ENDPOINT,
  }

  const required = ['URL', 'ACCESS_KEY', 'SECRET_KEY', 'BUCKET', 'REGION'] as const
  const missing = required
    .filter((k) => !cfg[k === 'URL' ? 'url' : k === 'ACCESS_KEY' ? 'accessKeyId' : k === 'SECRET_KEY' ? 'secretAccessKey' : k === 'BUCKET' ? 'bucket' : 'region'])
    .map((k) => `DO_SPACE_${k}`)

  if (missing.length) {
    console.log(`\n⚠️  Missing: ${missing.join(', ')}`)
    console.log('   Set DO_SPACE_URL, DO_SPACE_ACCESS_KEY, DO_SPACE_SECRET_KEY,')
    console.log('   DO_SPACE_BUCKET and DO_SPACE_REGION.\n')
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

  // Path-style is accepted by Backblaze B2 and required by Sirv, so it stays on
  // unless a provider is known to need virtual-host style.
  const forcePathStyle = process.env.DO_SPACE_FORCE_PATH_STYLE !== 'false'

  const client = new S3Client({
    region: cfg.region,
    ...(cfg.endpoint ? { endpoint: cfg.endpoint } : {}),
    forcePathStyle,
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
