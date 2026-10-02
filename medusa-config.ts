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

// ── Object storage (any S3-compatible provider) ────────────────────────────────
// The DO_SPACE_* names are historical but the driver is provider-agnostic, so the
// same variables target DigitalOcean Spaces, Backblaze B2 or Sirv. Only
// DO_SPACE_URL (the public delivery host) and DO_SPACE_ENDPOINT (the S3 API
// host) differ per provider.
const isStorageConfigured =
  Boolean(process.env.DO_SPACE_URL) &&
  Boolean(process.env.DO_SPACE_ACCESS_KEY) &&
  Boolean(process.env.DO_SPACE_SECRET_KEY) &&
  Boolean(process.env.DO_SPACE_BUCKET) &&
  Boolean(process.env.DO_SPACE_REGION);

if (isStorageConfigured) {
  console.log('✅ Object storage enabled');
  dynamicModules[Modules.FILE] = {
    resolve: '@medusajs/medusa/file',
    options: {
      providers: [
        {
          resolve: '@medusajs/file-s3',
          id: 's3',
          options: {
            file_url: process.env.DO_SPACE_URL,
            access_key_id: process.env.DO_SPACE_ACCESS_KEY,
            secret_access_key: process.env.DO_SPACE_SECRET_KEY,
            region: process.env.DO_SPACE_REGION,
            bucket: process.env.DO_SPACE_BUCKET,
            endpoint: process.env.DO_SPACE_ENDPOINT,
            // Sirv (https://s3.sirv.com) only accepts path-style requests.
            // AWS SDK v3 would otherwise build virtual-host URLs such as
            // https://<bucket>.s3.sirv.com and fail DNS/Signature. Everything
            // else (DigitalOcean, B2) works either way, so this stays opt-in.
            additional_client_config: process.env.DO_SPACE_FORCE_PATH_STYLE === 'true'
              ? { forcePathStyle: true }
              : {},
          },
        },
      ],
    },
  };
} else {
  /**
   * Warn in production too, not just development.
   *
   * Previously this only fired outside production, so a deployment missing the
   * DO_SPACE_* variables failed completely silently. Medusa falls back to its
   * built-in local disk provider, which on Render means an ephemeral
   * filesystem: uploads survive only until the next deploy, and the URLs stored
   * in `product_image.url` are generated against an inferred origin that
   * defaults to `http://localhost:9000`. The storefront then requests images
   * from its own machine and every product image 404s, with nothing in the logs
   * to say why.
   *
   * This is a warning and deliberately not a throw: refusing to boot would take
   * down the admin, regions, categories and product creation, which is a far
   * worse outcome than degraded images.
   */
  const missing = [
    'DO_SPACE_URL',
    'DO_SPACE_ACCESS_KEY',
    'DO_SPACE_SECRET_KEY',
    'DO_SPACE_BUCKET',
    'DO_SPACE_REGION',
  ].filter((name) => !process.env[name]);

  if (missing.length > 0) {
    console.warn(
      `⚠️  Object storage DISABLED — missing: ${missing.join(', ')}`
    );
    console.warn(
      '⚠️  Uploads are going to the local disk. On Render that filesystem is ' +
        'ephemeral, so files are lost on every redeploy and product image URLs ' +
        'are generated as http://localhost:9000/static/...'
    );
  }
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