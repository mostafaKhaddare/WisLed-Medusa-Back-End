import { loadEnv, defineConfig } from "@medusajs/framework/utils";

loadEnv(process.env.NODE_ENV || "development", process.cwd());

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS || "http://localhost:3000,https://wisled-medusa-back-end-production.up.railway.app",
      adminCors: process.env.ADMIN_CORS || "http://localhost:7000,http://localhost:3000,https://wisled-medusa-back-end-production.up.railway.app",
      authCors: process.env.AUTH_CORS || "http://localhost:7000,http://localhost:3000,https://wisled-medusa-back-end-production.up.railway.app",
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
  },
  admin: {
    develop: {
      host: process.env.ADMIN_HOST || "localhost",
      port: process.env.ADMIN_PORT || 7001,
      open: false, // Avoids opening browser on server start
      allowedHosts: [
        "wisled-medusa-back-end-production.up.railway.app",
      ],
    },
  },
  modules: [
    {
      resolve: "./src/modules/product-media",
    },
    {
      resolve: "./src/modules/wishlist",
    },
  ],
});
