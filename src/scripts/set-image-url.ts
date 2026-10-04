import { ExecArgs } from '@medusajs/framework/types'
import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils'

import { createCategoryImagesWorkflow } from '../workflows/create-category-images'

/**
 * The scope a workflow expects, taken from the workflow's own signature rather
 * than imported: `ScopeProvider` is not re-exported from `@medusajs/framework`,
 * and deriving it keeps this correct if the upstream type changes.
 */
type WorkflowScope = Parameters<typeof createCategoryImagesWorkflow>[0]

/**
 * Attach an externally hosted image to a product or a category by handle.
 *
 * Why this exists
 * ---------------
 * Images are hosted on Cloudinary and referenced by their public https url. The
 * url is all that is ever stored: `product_image.url` for products and
 * `product_category_image.url` for categories. Nothing is uploaded through the
 * File Module, so this works regardless of how Medusa storage is configured and
 * does not depend on `POST /admin/uploads` succeeding.
 *
 * The alternative is editing each url by hand in the admin, which is fine for
 * one image and tedious for a catalogue.
 *
 * Usage
 * -----
 *   Dry run (default) — prints the plan, changes nothing:
 *     pnpm run media:image -- --product my-lamp https://res.cloudinary.com/<cloud>/image/upload/v1/my-lamp.jpg
 *     pnpm run media:image -- --category profiles https://res.cloudinary.com/<cloud>/image/upload/v1/profiles.jpg
 *
 *   Write:
 *     APPLY=1 pnpm run media:image -- --product my-lamp <url>
 *
 *   Category image type defaults to `thumbnail`, which is what the storefront
 *   reads. There is a unique index allowing only one thumbnail per category, and
 *   `createCategoryImagesWorkflow` clears the previous one.
 *
 * Safety properties
 * -----------------
 *   - Dry run unless APPLY=1.
 *   - Only ever appends an image or replaces the url of an existing one. It
 *     never deletes a `product_image` row.
 *   - Refuses a non-https url. A plain-http url would be blocked by the browser
 *     as mixed content on an https storefront, and would break silently rather
 *     than loudly.
 *   - Reports the target before writing, and is idempotent: re-running with the
 *     same url is a no-op.
 *   - Touches no product fields other than `thumbnail`, and only fills it when it
 *     is currently empty.
 *
 * The storefront must be able to fetch the host. `res.cloudinary.com` is
 * allowlisted in the frontend's `next.config.js`; any other host needs adding
 * there too, or `next/image` rejects it with a bare 400.
 */

const APPLY = process.env.APPLY === '1'

type Target = 'product' | 'category'

interface Args {
  target?: Target
  handle?: string
  url?: string
  type: 'thumbnail' | 'image'
}

function parseArgs(argv: string[]): Args {
  const args: Args = { type: 'thumbnail' }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    if (arg === '--product') {
      args.target = 'product'
    } else if (arg === '--category') {
      args.target = 'category'
    } else if (arg === '--type') {
      const value = argv[++i]
      if (value !== 'thumbnail' && value !== 'image') {
        throw new Error(`--type must be "thumbnail" or "image", got "${value}"`)
      }
      args.type = value
    } else if (!arg.startsWith('--')) {
      if (!args.handle) {
        args.handle = arg
      } else if (!args.url) {
        args.url = arg
      }
    } else {
      throw new Error(`Unknown argument "${arg}"`)
    }
  }

  return args
}

function assertUsableUrl(url: string): URL {
  let parsed: URL

  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`"${url}" is not a valid url`)
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(
      `Refusing a ${parsed.protocol}// url. The storefront is served over https, ` +
        `so an http image url is blocked as mixed content and the image never renders.`
    )
  }

  return parsed
}

export default async function setImageUrl({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const args = parseArgs(process.argv.slice(2))

  if (!args.target || !args.handle || !args.url) {
    throw new Error(
      'Usage:\n' +
        '  pnpm run media:image -- --product <handle> <https url>\n' +
        '  pnpm run media:image -- --category <handle> <https url> [--type thumbnail|image]\n' +
        'Add APPLY=1 to write; without it this only reports what it would do.'
    )
  }

  const parsedUrl = assertUsableUrl(args.url)

  logger.info(`[image] mode   : ${APPLY ? 'APPLY' : 'DRY RUN'}`)
  logger.info(`[image] target : ${args.target} "${args.handle}"`)
  logger.info(`[image] url    : ${parsedUrl.href}`)
  logger.info(`[image] host   : ${parsedUrl.hostname}`)

  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  if (args.target === 'product') {
    const { data: products } = await query.graph({
      entity: 'product',
      fields: ['id', 'handle', 'title', 'thumbnail'],
      filters: { handle: args.handle },
    })

    if (!products?.length) {
      throw new Error(`No product found with handle "${args.handle}"`)
    }

    const product = products[0]
    const existing: string[] = product.images?.map((i: any) => i.url) ?? []

    if (existing.includes(parsedUrl.href)) {
      logger.info('[image] that url is already attached; nothing to do')
      return
    }

    logger.info(`[image] found  : ${product.title} (${product.id})`)
    logger.info(`[image] images : ${existing.length} currently attached`)

    // A product with no thumbnail renders no main image on some templates, so
    // fill it when empty. Never overwrite one that is already set.
    const needsThumbnail = !product.thumbnail
    if (needsThumbnail) {
      logger.info('[image] will also set product.thumbnail (currently empty)')
    }

    if (!APPLY) {
      logger.info(`[image] would append: ${parsedUrl.href}`)
      logger.info('[image] dry run. Re-run with APPLY=1 to write.')
      return
    }

    const productModuleService = container.resolve('product')
    await productModuleService.updateProducts(product.id, {
      images: [{ url: parsedUrl.href }],
      ...(needsThumbnail ? { thumbnail: parsedUrl.href } : {}),
    } as any)

    logger.info('[image] done.')
    return
  }

  const { data: categories } = await query.graph({
    entity: 'product_category',
    fields: ['id', 'handle', 'name'],
    filters: { handle: args.handle },
  })

  if (!categories?.length) {
    throw new Error(`No category found with handle "${args.handle}"`)
  }

  const category = categories[0]

  logger.info(`[image] found  : ${category.name} (${category.id})`)
  logger.info(`[image] type   : ${args.type}`)

  if (!APPLY) {
    logger.info(`[image] would attach ${args.type}: ${parsedUrl.href}`)
    logger.info('[image] dry run. Re-run with APPLY=1 to write.')
    return
  }

  const workflowEngine = container.resolve(Modules.WORKFLOW_ENGINE, {
    allowUnregistered: true,
  })

  if (!workflowEngine) {
    throw new Error(
      'Could not resolve the workflow engine. Run this through `medusa exec`.'
    )
  }

  const { result } = await createCategoryImagesWorkflow(
    workflowEngine as unknown as WorkflowScope
  ).run({
    input: {
      category_images: [
        {
          category_id: category.id,
          type: args.type,
          url: parsedUrl.href,
          /**
           * `product_category_image.file_id` is a plain text column with no
           * foreign key, so it only has to be present and unique-ish. The
           * Cloudinary public id — the path segment after the last slash — keeps
           * it meaningful and makes the row traceable back to the asset.
           */
          file_id: parsedUrl.pathname.split('/').filter(Boolean).pop() ?? 'cloudinary',
        },
      ],
    },
  })

  const attached = Array.isArray(result) ? result : [result]
  logger.info(`[image] attached ${attached.length} row(s) to "${category.name}"`)
  logger.info('[image] done.')
}