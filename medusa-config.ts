const { loadEnv, defineConfig, Modules } = require('@medusajs/framework/utils');

const isProduction = process.env.NODE_ENV === 'production';
const isBuildCommand = process.argv.some((arg) => arg.toLowerCase().includes('build'));
loadEnv(process.env.NODE_ENV || 'development', process.cwd());

const requiredProductionEnv = [
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'COOKIE_SECRET',
  'MEDUSA_BACKEND_URL',
  'STORE_CORS',
  'ADMIN_CORS',
  'AUTH_CORS',
];

const missingProductionEnv = requiredProductionEnv.filter((name) => !process.env[name]);
if (isProduction && !isBuildCommand && missingProductionEnv.length > 0) {
  throw new Error(
    `Missing required production env vars: ${missingProductionEnv.join(', ')}`
  );
}

const parseCors = (value) =>
  value
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .join(',') ||
  (isProduction ? undefined : 'http://localhost:3000,http://localhost:8000');

const dynamicModules = {};

// ── Stripe ────────────────────────────────────────────────────────────────────
const stripeApiKey = process.env.STRIPE_API_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const isStripeConfigured = Boolean(stripeApiKey) && Boolean(stripeWebhookSecret);

if (isStripeConfigured) {
  console.log('✅ Stripe enabled');
  dynamicModules[Modules.PAYMENT] = {
    resolve: '@medusajs/medusa/payment',
    options: {
      providers: [
        {
          resolve: '@medusajs/medusa/payment-stripe',
          id: 'stripe',
          options: {
            apiKey: stripeApiKey,
            webhookSecret: stripeWebhookSecret,
          },
        },
      ],
    },
  };
}

// ── Object storage: Backblaze B2 over the S3-compatible API ───────────────────
//
// The variables keep the historical DO_SPACE_* names on purpose. Renaming them
// would silently un-configure a live Render service, since the dashboard is the
// only place those values exist and `render.yaml` marks every one of them
// `sync: false`. Do not introduce a parallel B2_* or S3_* set: two naming
// schemes for one bucket is how the "storage is configured but uploads 500"
// state gets created and then debugged from the wrong place.
const STORAGE_ENV = [
  'DO_SPACE_URL',
  'DO_SPACE_ACCESS_KEY',
  'DO_SPACE_SECRET_KEY',
  'DO_SPACE_BUCKET',
  'DO_SPACE_REGION',
] as const;

const isStorageConfigured = STORAGE_ENV.every((name) => Boolean(process.env[name]));

/**
 * Backblaze B2 regions look like `us-west-004`: two letters, a word, and a
 * three-digit cluster number. AWS regions end in a single digit (`us-east-1`).
 * The digit count is what makes it safe to tell them apart — a plain `us-`
 * prefix test would read B2's `us-west-004` as AWS, which is exactly the
 * confusion this replaces.
 */
const B2_REGION_PATTERN = /^[a-z]{2}-[a-z]+-\d{3}$/;

const isAwsEndpoint = (endpoint?: string): boolean => {
  if (!endpoint) return false;
  try {
    return new URL(endpoint).hostname.endsWith('.amazonaws.com');
  } catch {
    return false;
  }
};

if (isStorageConfigured) {
  const bucket = process.env.DO_SPACE_BUCKET as string;
  const region = process.env.DO_SPACE_REGION as string;
  const publicBaseUrl = (process.env.DO_SPACE_URL as string).replace(/\/+$/, '');
  const configuredEndpoint = process.env.DO_SPACE_ENDPOINT;

  /**
   * Resolve the API endpoint instead of leaving it to the SDK.
   *
   * With no endpoint set, the AWS SDK derives `https://s3.<region>.amazonaws.com`,
   * which does not exist for a B2 bucket and fails at DNS. Deriving the B2 host
   * from the cluster keeps a correct configuration working when
   * DO_SPACE_ENDPOINT is simply absent.
   */
  const endpoint =
    configuredEndpoint ||
    (B2_REGION_PATTERN.test(region) ? `https://s3.${region}.backblazeb2.com` : undefined);

  /**
   * `file_url` is what the File Module returns to the admin and what it stores in
   * `product_image.url`, so it is the URL the browser will request. A plain-HTTP
   * value is rejected by the browser as mixed content on an HTTPS admin, which
   * presents as a broken image and never as a configuration error.
   */
  if (isProduction && !publicBaseUrl.toLowerCase().startsWith('https://')) {
    throw new Error(
      `DO_SPACE_URL must be an https:// URL. Refusing to boot, because a plain ` +
        `http:// public URL makes every stored product image fail as mixed content. ` +
        `Got a value starting with "${publicBaseUrl.slice(0, 12)}".`
    );
  }

  /**
   * A leftover endpoint from the previous provider is the failure mode that looks
   * like bad credentials: the request is signed for one host and sent to
   * another. Only warn — the value may be correct and unverifiable from here.
   */
  if (
    configuredEndpoint &&
    B2_REGION_PATTERN.test(region) &&
    !new URL(configuredEndpoint).hostname.endsWith('.backblazeb2.com')
  ) {
    console.warn(
      `⚠️  DO_SPACE_REGION "${region}" is a Backblaze B2 cluster, but ` +
        `DO_SPACE_ENDPOINT points at "${new URL(configuredEndpoint).hostname}". ` +
        `Uploads will fail until one of the two is corrected.`
    );
  }

  /**
   * Drop the per-object ACL unless this is genuinely AWS.
   *
   * `@medusajs/file-s3` sends `ACL: public-read` on every upload and B2 rejects
   * it, which is the 500 on POST /admin/uploads. AWS is detected from the
   * endpoint host only: the region cannot be used for this, because B2 clusters
   * are also named `us-...`.
   */
  const stripAcl =
    process.env.DO_SPACE_STRIP_ACL === 'true' || !isAwsEndpoint(configuredEndpoint);

  /**
   * Path-style addressing for anything that is not AWS. B2 accepts both styles,
   * but a bucket name containing dots breaks TLS under virtual-host style, and
   * this matches what `media:upload` already does, so the app and the migration
   * script address objects identically.
   */
  const forcePathStyle =
    process.env.DO_SPACE_FORCE_PATH_STYLE !== 'false' && !isAwsEndpoint(configuredEndpoint);

  console.log('✅ Object storage enabled (Backblaze B2, S3-compatible API)');
  console.log(`   bucket   : ${bucket}`);
  console.log(`   region   : ${region}`);
  console.log(`   endpoint : ${endpoint ?? '(derived by the SDK)'}`);
  console.log(`   public   : ${publicBaseUrl}`);
  console.log(`   acl      : ${stripAcl ? 'stripped (unsupported by this endpoint)' : 'public-read (AWS)'}`);
  console.log(`   addressing: ${forcePathStyle ? 'path-style' : 'virtual-hosted'}`);

  dynamicModules[Modules.FILE] = {
    resolve: '@medusajs/medusa/file',
    options: {
      providers: [
        {
          resolve: stripAcl ? './src/providers/acl-free-s3' : '@medusajs/file-s3',
          id: 's3',
          options: {
            file_url: publicBaseUrl,
            access_key_id: process.env.DO_SPACE_ACCESS_KEY,
            secret_access_key: process.env.DO_SPACE_SECRET_KEY,
            region,
            bucket,
            endpoint,
            additional_client_config: forcePathStyle ? { forcePathStyle: true } : {},
          },
        },
      ],
    },
  };
} else if (isProduction && !isBuildCommand) {
  /**
   * Refuse to boot in production rather than fall back to local disk.
   *
   * Without the File module below, Medusa registers its built-in local disk
   * provider instead. On Render that filesystem is ephemeral, and — the part
   * that actually matters — it derives its public origin from the request host
   * and falls back to `http://localhost:9000` when it cannot. That URL is then
   * written into `product_image.url` and `product.thumbnail`, so it outlives the
   * deploy that created it and survives fixing the environment. Every later
   * image is broken in the browser as mixed content, and the rows have to be
   * migrated by hand.
   *
   * That silent fallback is how the current catalog ended up with localhost URLs
   * in the first place. Failing loudly here means a missing variable is a failed
   * deploy with a named cause instead of a production database quietly filling
   * with dead image URLs.
   */
  const missing = STORAGE_ENV.filter((name) => !process.env[name]);
  throw new Error(
    `Missing required production object-storage env vars: ${missing.join(', ')}. ` +
      `Refusing to start Medusa with the local file provider: on Render its disk ` +
      `is ephemeral and every uploaded image would be stored with a ` +
      `http://localhost:9000/static/... url that cannot be fixed later without ` +
      `migrating those rows.`
  );
} else {
  console.warn(
    `⚠️  Object storage disabled — missing: ${STORAGE_ENV.filter((n) => !process.env[n]).join(', ')}. ` +
      `Using the local file provider. Development only: do not boot this way in production.`
  );
}

// ── Resend (Email) ────────────────────────────────────────────────────────────
const isResendConfigured =
  Boolean(process.env.RESEND_API_KEY) &&
  Boolean(process.env.RESEND_FROM_EMAIL);

if (isResendConfigured) {
  console.log('✅ Resend email enabled');
  dynamicModules[Modules.NOTIFICATION] = {
    resolve: '@medusajs/medusa/notification',
    options: {
      providers: [
        {
          resolve: './src/modules/resend',
          id: 'resend',
          options: {
            channels: ['email'],
            api_key: process.env.RESEND_API_KEY,
            from: process.env.RESEND_FROM_EMAIL,
          },
        },
      ],
    },
  };
} else if (!isProduction) {
  console.warn('⚠️  Resend vars missing — email notifications disabled');
}

// ── Index Engine ──────────────────────────────────────────────────────────────
const isIndexEngineEnabled = process.env.MEDUSA_FF_INDEX_ENGINE === 'true';

if (isIndexEngineEnabled) {
  console.log('✅ Index engine enabled');
  dynamicModules[Modules.INDEX] = {
    resolve: '@medusajs/index',
  };
}

// ── Custom Modules ────────────────────────────────────────────────────────────
dynamicModules['productMedia'] = {
  resolve: './src/modules/product-media',
  definition: {
    isQueryable: true,
  },
};
dynamicModules['wishlist'] = {
  resolve: './src/modules/wishlist',
  definition: {
    isQueryable: true,
  },
};

const jwtSecret = process.env.JWT_SECRET || (isProduction && !isBuildCommand ? undefined : 'dev-jwt-secret');
const cookieSecret = process.env.COOKIE_SECRET || (isProduction && !isBuildCommand ? undefined : 'dev-cookie-secret');

if (isProduction && !isBuildCommand && (!jwtSecret || !cookieSecret)) {
  throw new Error('JWT_SECRET and COOKIE_SECRET must be defined in production.');
}

// ── Export Config ─────────────────────────────────────────────────────────────
module.exports = defineConfig({
  admin: {
    backendUrl: process.env.MEDUSA_BACKEND_URL,
    disable: process.env.DISABLE_MEDUSA_ADMIN === 'true',
  },
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    workerMode: process.env.WORKER_MODE || 'shared',
    http: {
      storeCors: parseCors(process.env.STORE_CORS),
      adminCors: parseCors(process.env.ADMIN_CORS),
      authCors: parseCors(process.env.AUTH_CORS),
      jwtSecret,
      cookieSecret,
    },
  },
  modules: {
    ...dynamicModules,
  },
});