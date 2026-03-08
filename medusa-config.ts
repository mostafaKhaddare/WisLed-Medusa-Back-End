const { loadEnv, defineConfig, Modules } = require('@medusajs/framework/utils');

loadEnv(process.env.NODE_ENV || 'development', process.cwd());

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

// ── DigitalOcean Spaces (S3) ──────────────────────────────────────────────────
const isStorageConfigured =
  Boolean(process.env.DO_SPACE_URL) &&
  Boolean(process.env.DO_SPACE_ACCESS_KEY) &&
  Boolean(process.env.DO_SPACE_SECRET_KEY) &&
  Boolean(process.env.DO_SPACE_BUCKET) &&
  Boolean(process.env.DO_SPACE_REGION);

if (isStorageConfigured) {
  console.log('✅ DigitalOcean Spaces enabled');
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
          },
        },
      ],
    },
  };
} else {
  console.warn('⚠️  DO Space vars missing — using local file storage');
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
} else {
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
      storeCors: process.env.STORE_CORS,
      adminCors: process.env.ADMIN_CORS,
      authCors: process.env.AUTH_CORS,
      jwtSecret: process.env.JWT_SECRET || 'supersecret',
      cookieSecret: process.env.COOKIE_SECRET || 'supersecret',
    },
  },
  modules: {
    ...dynamicModules,
  },
});