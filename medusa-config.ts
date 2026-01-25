import { loadEnv, defineConfig } from "@medusajs/framework/utils";

loadEnv(process.env.NODE_ENV || "development", process.cwd());

module.exports = defineConfig({
  projectConfig: {
    workerMode: process.env.MEDUSA_WORKER_MODE as "shared" | "worker" | "server",     // redisUrl: process.env.REDIS_URL, // Commented out to avoid connection error
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    http: {
      storeCors: process.env.STORE_CORS || "http://localhost:3000,https://wisled-medusa-back-end-production.up.railway.app",
      adminCors: process.env.ADMIN_CORS || "http://localhost:7000,http://localhost:3000,https://wisled-medusa-back-end-production.up.railway.app",
      authCors: process.env.AUTH_CORS || "http://localhost:7000,http://localhost:3000,https://wisled-medusa-back-end-production.up.railway.app",
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
  },
  admin: {
    disable: process.env.DISABLE_MEDUSA_ADMIN === "true",
    backendUrl: process.env.BACKEND_URL,
  },
  modules: {
   
    eventBus: {
      resolve: "@medusajs/event-bus-redis",
      options: {
        redisUrl: process.env.REDIS_URL
      }
    },
    cacheService: {
      resolve: "@medusajs/cache-redis",
      options: {
        redisUrl: process.env.REDIS_URL
      }
    },
    workflowEngine: {
      resolve: "@medusajs/workflow-engine-redis",
      options: {
        redis: {
          url: process.env.REDIS_URL
        }
      }
    },
   
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
  },
});