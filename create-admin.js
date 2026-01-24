const { medusaApp } = require("@medusajs/medusa");

async function createAdminUser() {
  const email = "admin@example.com";
  const password = "Wacwacrac123@";
  
  try {
    console.log("Creating admin user...");
    
    // Initialize Medusa app
    const app = await medusaApp({
      directory: process.cwd(),
      configModule: {
        projectConfig: {
          databaseUrl: process.env.DATABASE_URL || "postgresql://postgres:nnlFdoQmHwqIWOyKdBKFiUIZ...",
        }
      }
    });

    const userService = app.container.resolve("userService");
    await userService.create({
      email,
      password,
      first_name: "Admin",
      last_name: "User",
      role: "admin"
    });
    
    console.log(`✅ Admin user created successfully!`);
    console.log(`📧 Email: ${email}`);
    console.log(`🔑 Password: ${password}`);
    console.log(`🌐 Admin URL: https://wisled-medusa-back-end-production.up.railway.app/admin`);
    
    await app.close();
  } catch (error) {
    console.error("❌ Error creating admin user:", error.message);
  }
}

createAdminUser();
