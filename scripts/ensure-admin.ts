import { MedusaContainer } from "@medusajs/medusa";
import { UserService } from "@medusajs/medusa/dist/services/user";

export default async function ensureAdminUser(container: MedusaContainer) {
  const userService = container.resolve<UserService>("userService");
  
  try {
    // Check if admin user already exists
    const existingUsers = await userService.list({ email: "admin@example.com" });
    
    if (existingUsers.length === 0) {
      // Create admin user if it doesn't exist
      await userService.create({
        email: "admin@example.com",
        password: "Wacwacrac123@",
        first_name: "Admin",
        last_name: "User",
        role: "admin"
      });
      
      console.log("✅ Admin user created: admin@example.com / Wacwacrac123@");
      console.log("🌐 Admin URL: https://wisled-medusa-back-end-production.up.railway.app/admin");
    } else {
      console.log("ℹ️ Admin user already exists");
    }
  } catch (error) {
    console.error("❌ Error ensuring admin user:", error.message);
  }
}
