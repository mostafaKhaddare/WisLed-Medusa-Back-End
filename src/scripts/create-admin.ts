import { MedusaContainer } from "@medusajs/framework";
import { IUserModuleService } from "@medusajs/framework/types";
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createUsersWorkflow } from "@medusajs/medusa/core-flows";

export default async function createAdminUser({ container }: { container: MedusaContainer }) {
  const userService = container.resolve<IUserModuleService>(Modules.USER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  
  try {
    // Check if admin user already exists using query
    const { data: existingUsers } = await query.graph({
      entity: "user",
      fields: ["*"],
      filters: {
        email: "admin@example.com"
      }
    });
    
    if (existingUsers.length === 0) {
      // Create admin user using workflow
      const { result: users } = await createUsersWorkflow(container).run({
        input: {
          users: [{
            email: "admin@example.com",
            first_name: "Admin",
            last_name: "User"
          }]
        }
      });
      
      console.log("✅ Admin user created: admin@example.com");
      console.log("🌐 Admin URL: https://wisled-medusa-back-end-production.up.railway.app/admin");
    } else {
      console.log("ℹ️ Admin user already exists: admin@example.com");
    }
  } catch (error) {
    console.error("❌ Error creating admin user:", error.message);
  }
}
