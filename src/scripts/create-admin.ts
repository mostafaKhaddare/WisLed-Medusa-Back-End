import { MedusaContainer } from "@medusajs/framework";
import { IUserModuleService } from "@medusajs/framework/types";
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createUsersWorkflow } from "@medusajs/medusa/core-flows";

const adminBaseUrl = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000";

export default async function createAdminUser({ container }: { container: MedusaContainer }) {
  const userService = container.resolve<IUserModuleService>(Modules.USER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  try {
    const { data: existingUsers } = await query.graph({
      entity: "user",
      fields: ["*"],
      filters: {
        email: "admin@example.com"
      }
    });

    if (existingUsers.length === 0) {
      await createUsersWorkflow(container).run({
        input: {
          users: [{
            email: "admin@example.com",
            first_name: "Admin",
            last_name: "User"
          }]
        }
      });

      console.log("✅ Admin user created: admin@example.com");
      console.log(`🌐 Admin URL: ${new URL("/admin", adminBaseUrl).toString()}`);
    } else {
      console.log("ℹ️ Admin user already exists: admin@example.com");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("❌ Error creating admin user:", message);
  }
}
