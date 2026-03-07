const path = require('path');
const { loadEnv, defineConfig, Modules } = require('@medusajs/framework/utils');

loadEnv(process.env.NODE_ENV || 'development', process.cwd());

// Medusa Cloud handles production secrets natively.

// ---------------------------------------------------------------------------
// Redis URLs — allow granular overrides or fall back to the main REDIS_URL
// ---------------------------------------------------------------------------
const redisUrl = process.env.REDIS_URL;
const cacheRedisUrl = process.env.CACHE_REDIS_URL || redisUrl;
const lockingRedisUrl = process.env.LOCKING_REDIS_URL || redisUrl;

// ---------------------------------------------------------------------------
// Stripe Payment Module (conditional)
// ---------------------------------------------------------------------------
const stripeApiKey = process.env.STRIPE_API_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const isStripeConfigured = Boolean(stripeApiKey) && Boolean(stripeWebhookSecret);

if (isStripeConfigured) {
  console.log('[medusa-config] Stripe credentials found — enabling Stripe payment provider');
} else {
  console.log('[medusa-config] Stripe credentials not set — payment module disabled');
}

// ---------------------------------------------------------------------------
// DigitalOcean Spaces / S3 File Module (conditional)
// ---------------------------------------------------------------------------
const doSpaceAccessKey = process.env.DO_SPACE_ACCESS_KEY;
const doSpaceSecretKey = process.env.DO_SPACE_SECRET_KEY;
const isS3Configured = Boolean(doSpaceAccessKey) && Boolean(doSpaceSecretKey);

if (isS3Configured) {
  console.log('[medusa-config] DigitalOcean Spaces credentials found — enabling S3 file storage');
} else {
  console.log('[medusa-config] S3 credentials not set — using default local file storage');
}

// ---------------------------------------------------------------------------
// Redis availability check
// ---------------------------------------------------------------------------
if (redisUrl) {
  console.log('[medusa-config] REDIS_URL found — enabling Redis event bus, workflow engine, caching, and locking');
} else {
  console.warn('[medusa-config] REDIS_URL not set — Redis infrastructure modules disabled (development only)');
}

// ---------------------------------------------------------------------------
// Build the modules array
// ---------------------------------------------------------------------------
const modules: unknown[] = [
  // ── Custom application modules ──────────────────────────────────────────
  {
    resolve: path.resolve(__dirname, './src/modules/product-media'),
    definition: { isQueryable: true },
  },
  {
    resolve: path.resolve(__dirname, './src/modules/wishlist'),
    definition: { isQueryable: true },
  },
];

// ── Redis infrastructure modules (production) ─────────────────────────────
if (redisUrl) {
  modules.push(
    {
      resolve: '@medusajs/medusa/event-bus-redis',
      options: {
        redisUrl,
      },
    },
    {
      resolve: '@medusajs/medusa/workflow-engine-redis',
      options: {
        redis: {
          redisUrl,
        },
      },
    },
    {
      resolve: '@medusajs/medusa/caching',
      options: {
        providers: [
          {
            resolve: '@medusajs/caching-redis',
            id: 'caching-redis',
            is_default: true,
            options: {
              redisUrl: cacheRedisUrl,
            },
          },
        ],
      },
    },
    {
      resolve: '@medusajs/medusa/locking',
      options: {
        providers: [
          {
            resolve: '@medusajs/medusa/locking-redis',
            id: 'locking-redis',
            is_default: true,
            options: {
              redisUrl: lockingRedisUrl,
            },
          },
        ],
      },
    }
  );
}

// ── Stripe payment module (conditional) ───────────────────────────────────
if (isStripeConfigured) {
  modules.push({
    resolve: '@medusajs/medusa/payment',
    options: {
      providers: [
        {
          resolve: '@medusajs/payment-stripe',
          id: 'stripe',
          options: {
            apiKey: stripeApiKey,
            webhookSecret: stripeWebhookSecret,
          },
        },
      ],
    },
  });
}

// ── S3 / DigitalOcean Spaces file module (conditional) ────────────────────
if (isS3Configured) {
  modules.push({
    resolve: '@medusajs/medusa/file',
    options: {
      providers: [
        {
          resolve: '@medusajs/file-s3',
          id: 's3',
          options: {
            file_url: process.env.DO_SPACE_URL,
            access_key_id: doSpaceAccessKey,
            secret_access_key: doSpaceSecretKey,
            region: process.env.DO_SPACE_REGION,
            bucket: process.env.DO_SPACE_BUCKET,
            endpoint: process.env.DO_SPACE_ENDPOINT,
          },
        },
      ],
    },
  });
}

// ---------------------------------------------------------------------------
// Medusa Configuration
// ---------------------------------------------------------------------------
module.exports = defineConfig({
  admin: {
    // The URL of the deployed Medusa backend — used to configure admin API calls
    backendUrl: process.env.MEDUSA_BACKEND_URL || 'http://localhost:9000',
    // Disable the admin panel in worker instances to save build time
    disable: process.env.DISABLE_MEDUSA_ADMIN === 'true',
  },
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    // Required for session storage, event bus fallback, etc.
    redisUrl: process.env.REDIS_URL,
    // Controls deployment mode:
    //   "server"  → handles HTTP API requests + serves Admin UI  (set in production server instance)
    //   "worker"  → handles subscribers, scheduled jobs           (set in production worker instance)
    //   "shared"  → both in one process                           (default, suitable for development)
    workerMode: (process.env.MEDUSA_WORKER_MODE as 'shared' | 'worker' | 'server') || 'shared',
    http: {
      // CORS origins — must be set to your actual frontend / admin URLs in production
      storeCors: process.env.STORE_CORS || 'http://localhost:8000',
      adminCors: process.env.ADMIN_CORS || 'http://localhost:9000,http://localhost:7001',
      authCors: process.env.AUTH_CORS || 'http://localhost:9000,http://localhost:7001',
      // Secrets — Local development fallbacks. Medusa Cloud automatically overrides these in production.
      jwtSecret: process.env.JWT_SECRET || 'supersecret',
      cookieSecret: process.env.COOKIE_SECRET || 'supersecret',
    },
  },
  modules,
});