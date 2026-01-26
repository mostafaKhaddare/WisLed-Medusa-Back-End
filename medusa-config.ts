import { defineConfig, Modules } from "@medusajs/framework/utils";

// 1. Your existing modules configuration
const modules = {
  /* ---------- CACHING ---------- */
  [Modules.CACHING]: {
    resolve: "@medusajs/medusa/caching",
    options: {
      providers: [
        {
          resolve: "@medusajs/caching-redis",
          id: "caching-redis",
          is_default: true,
          options: {
            redisUrl: process.env.CACHE_REDIS_URL || process.env.REDIS_URL,
          },
        },
      ],
    },
  },

  /* ---------- EVENT BUS ---------- */
  [Modules.EVENT_BUS]: {
    resolve: "@medusajs/medusa/event-bus-redis",
    options: {
      redisUrl: process.env.REDIS_URL,
    },
  },

  /* ---------- WORKFLOW ENGINE ---------- */
  [Modules.WORKFLOW_ENGINE]: {
    resolve: "@medusajs/medusa/workflow-engine-redis",
    options: {
      redis: {
        redisUrl: process.env.REDIS_URL,
      },
    },
  },

  /* ---------- LOCKING ---------- */
  [Modules.LOCKING]: {
    resolve: "@medusajs/medusa/locking",
    options: {
      providers: [
        {
          resolve: "@medusajs/medusa/locking-redis",
          id: "locking-redis",
          is_default: true,
          options: {
            redisUrl: process.env.LOCKING_REDIS_URL || process.env.REDIS_URL,
          },
        },
      ],
    },
  },

  /* ---------- FILE STORAGE ---------- */
  [Modules.FILE]: {
    resolve: "@medusajs/medusa/file",
    options: {
      providers: [
        {
          resolve: "@medusajs/file-s3",
          id: "s3",
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
  },

  /* ---------- NOTIFICATIONS ---------- */
  [Modules.NOTIFICATION]: {
    resolve: "@medusajs/medusa/notification",
    options: {
      providers: [
        {
          resolve: "./src/modules/resend",
          id: "resend",
          options: {
            channels: ["email"],
            api_key: process.env.RESEND_API_KEY,
            from: process.env.RESEND_FROM_EMAIL,
          },
        },
      ],
    },
  },

  /* ---------- SEARCH / INDEX ---------- */
  [Modules.INDEX]: {
    resolve: "@medusajs/index",
  },

  /* ---------- CUSTOM MODULES ---------- */
  wishlist: {
    resolve: "./src/modules/wishlist",
    definition: {
      isQueryable: true,
    },
  },

  productMedia: {
    resolve: "./src/modules/product-media",
    definition: {
      isQueryable: true,
    },
  },
};

// 2. The Final Export
export default defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS,
      adminCors: process.env.ADMIN_CORS,
      authCors: process.env.AUTH_CORS,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
  },
  
  // ✅ ADD ADMIN CONFIG HERE (Sibling to modules, not inside it)
  admin: {
    backendUrl: process.env.MEDUSA_BACKEND_URL,
  },

  modules: modules,
});