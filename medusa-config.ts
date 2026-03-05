const path = require('path');
const { loadEnv, defineConfig, Modules } = require('@medusajs/framework/utils');

loadEnv(process.env.NODE_ENV || 'development', process.cwd());

const dynamicModules = {};

const stripeApiKey = process.env.STRIPE_API_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

const isStripeConfigured = Boolean(stripeApiKey) && Boolean(stripeWebhookSecret);

if (isStripeConfigured) {
  console.log('Stripe API key and webhook secret found. Enabling payment module');
  dynamicModules[Modules.PAYMENT] = {
    resolve: '@medusajs/medusa/payment',
    options: {
      providers: [
        {
          // FIX: Correct package name (removed /medusa/)
          resolve: '@medusajs/payment-stripe',
          id: 'stripe',
          options: {
            apiKey: stripeApiKey,
            webhookSecret: stripeWebhookSecret
          }
        }
      ]
    }
  };
}

// Check if S3/DigitalOcean Spaces credentials are configured
const doSpaceAccessKey = process.env.DO_SPACE_ACCESS_KEY;
const doSpaceSecretKey = process.env.DO_SPACE_SECRET_KEY;
const isS3Configured = Boolean(doSpaceAccessKey) && Boolean(doSpaceSecretKey);

if (isS3Configured) {
  console.log('DigitalOcean Spaces credentials found. Enabling S3 file storage');
  dynamicModules[Modules.FILE] = {
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
            endpoint: process.env.DO_SPACE_ENDPOINT
          }
        }
      ]
    }
  };
} else {
  console.log('S3 credentials not found. File storage will use default local storage.');
}

const modules = {
  // FIX: Added path.resolve to ensure the folder is found
  productMedia: {
    resolve: path.resolve(__dirname, "./src/modules/product-media"),
    definition: {
      isQueryable: true
    }
  },
  wishlist: {
    resolve: path.resolve(__dirname, "./src/modules/wishlist"),
    definition: {
      isQueryable: true
    }
  },
  // If you still need the Notification (Resend) module, paste it back here
};

module.exports = defineConfig({
  admin: {
    backendUrl: process.env.MEDUSA_BACKEND_URL,
    disable: process.env.DISABLE_MEDUSA_ADMIN === 'true'
  },
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS,
      adminCors: process.env.ADMIN_CORS,
      authCors: process.env.AUTH_CORS,
      jwtSecret: process.env.JWT_SECRET || 'supersecret',
      cookieSecret: process.env.COOKIE_SECRET || 'supersecret'
    },
  },
  modules: {
    ...dynamicModules,
    ...modules
  },
});