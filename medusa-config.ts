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

// ── PayPal ────────────────────────────────────────────────────────────────────
const paypalClientId = process.env.PAYPAL_CLIENT_ID;
const paypalClientSecret = process.env.PAYPAL_CLIENT_SECRET;
const isPayPalConfigured = Boolean(paypalClientId) && Boolean(paypalClientSecret);

if (isPayPalConfigured) {
  console.log('✅ PayPal enabled');
  dynamicModules[Modules.PAYMENT] = {
    resolve: '@medusajs/medusa/payment',
    options: {
      providers: [
        {
          resolve: './src/modules/paypal',
          id: 'paypal',
          options: {
            client_id: paypalClientId,
            client_secret: paypalClientSecret,
            environment: process.env.PAYPAL_ENVIRONMENT || 'sandbox',
            autoCapture: process.env.PAYPAL_AUTO_CAPTURE === 'true',
            webhook_id: process.env.PAYPAL_WEBHOOK_ID,
          },
        },
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

// ── Object storage: Supabase Storage (S3-compatible) ──────────────────────────
/**
 * Resolve a storage setting from either naming scheme.
 *
 * `render.yaml` declares the `DO_SPACE_*` names, while this config was written
 * against `S3_*` when storage moved to Supabase. Render stores the values in
 * its dashboard under those declared names, so only one of the two sets is ever
 * populated. Reading both keeps either deployment working, and a value that is
 * already correct under the preferred name is never overridden by the fallback.
 */
const pickStorageVar = (preferred: string, legacy: string) =>
  process.env[preferred] || process.env[legacy] || undefined

const isStorageConfigured = Boolean(
  pickStorageVar('S3_FILE_URL', 'DO_SPACE_URL') &&
    pickStorageVar('S3_ACCESS_KEY_ID', 'DO_SPACE_ACCESS_KEY') &&
    pickStorageVar('S3_SECRET_ACCESS_KEY', 'DO_SPACE_SECRET_KEY') &&
    pickStorageVar('S3_BUCKET', 'DO_SPACE_BUCKET') &&
    pickStorageVar('S3_REGION', 'DO_SPACE_REGION')
);

/**
 * Ensure the public base URL actually addresses the bucket.
 *
 * Medusa stores `file_url + "/" + filename` in `product_image.url`, so a value
 * without the bucket in it produces urls that address the project root instead
 * of the bucket:
 *
 *   https://cvfukgixcjzehsotczko.supabase.co/CREATE%20LIKE%20THIS%20WITHOUTWATERMARK.png
 *
 * which 404s, while the file actually lives at:
 *
 *   https://cvfukgixcjzehsotczko.supabase.co/storage/v1/object/public/Wisled_bucket_medusa/CREATE%20LIKE%20THIS%20WITHOUTWATERMARK.png
 *
 * Uploads still succeed, because the bucket travels separately in the
 * PutObject command, so the omission is invisible until an image is
 * requested — and the broken url looks plausible enough to read as a
 * permissions problem rather than a missing path segment.
 *
 * The bucket is appended when it is absent. A value that already names it is
 * left exactly as it is, so an explicitly correct setting is never rewritten.
 */
const withBucketPath = (value, bucket) => {
  const trimmed = value.replace(/\/+$/, '')
  let url

  try {
    url = new URL(trimmed)
  } catch {
    throw new Error(
      `S3_FILE_URL is not a valid URL: "${trimmed}". It must be the https ` +
        `address the bucket's files are served from.`
    )
  }

  const segments = url.pathname.split('/').filter(Boolean)

  if (segments[segments.length - 1] === bucket || segments.includes(bucket)) {
    return trimmed
  }

  url.pathname = '/' + [...segments, bucket].join('/')
  return url.toString().replace(/\/+$/, '')
}

if (isStorageConfigured) {
  const bucket = pickStorageVar('S3_BUCKET', 'DO_SPACE_BUCKET') as string
  const fileUrl = pickStorageVar('S3_FILE_URL', 'DO_SPACE_URL') as string
  const publicBaseUrl = withBucketPath(fileUrl, bucket)
  console.log('✅ Supabase Storage enabled')
  dynamicModules[Modules.FILE] = {
    resolve: '@medusajs/medusa/file',
    options: {
      providers: [
        {
          /**
           * Supabase Storage does not support per-object ACLs — its S3
           * compatibility table lists `x-amz-acl` under unsupported features.
           * `@medusajs/file-s3` sends one on every upload, which is exactly the
           * 500 on POST /admin/uploads. The wrapper strips it from the command
           * before it is serialized, so it is never generated at all.
           */
          resolve: './src/providers/acl-free-s3',
          id: 's3',
          options: {
            file_url: publicBaseUrl,
            access_key_id: pickStorageVar('S3_ACCESS_KEY_ID', 'DO_SPACE_ACCESS_KEY'),
            secret_access_key: pickStorageVar(
              'S3_SECRET_ACCESS_KEY',
              'DO_SPACE_SECRET_KEY'
            ),
            region: pickStorageVar('S3_REGION', 'DO_SPACE_REGION'),
            bucket,
            endpoint: pickStorageVar('S3_ENDPOINT', 'DO_SPACE_ENDPOINT'),
            /**
             * Required. Supabase's own S3 examples set forcePathStyle: true,
             * and the endpoint is not a real AWS host, so the SDK must not try
             * to derive a virtual-hosted URL from the bucket name.
             */
            additional_client_config: { forcePathStyle: true },
          },
        },
      ],
    },
  };
} else if (!isProduction) {
  console.warn('⚠️  S3 vars missing — using local file storage');
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