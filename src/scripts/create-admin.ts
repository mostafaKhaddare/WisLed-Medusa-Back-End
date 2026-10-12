import { MedusaContainer } from "@medusajs/framework";
import { IAuthModuleService, IUserModuleService } from "@medusajs/framework/types";
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createUsersWorkflow } from "@medusajs/medusa/core-flows";

const adminBaseUrl = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000";

/**
 * Create (or update) the admin account used to log into the Medusa admin
 * at `/app/login`.
 *
 * Creating the `user` row alone is not enough: the emailpass provider
 * authenticates against an `auth_identity` record, and `createUsersWorkflow`
 * only writes the `user` row — its own docs note that an auth identity must
 * be attached separately to make the account login-capable. Without that
 * step every `POST /auth/user/emailpass` is answered with 401
 * "Invalid email or password", because the provider finds no credential for
 * the email at all.
 *
 * This mirrors the three steps Medusa's own `medusa user` CLI performs:
 *   1. create the `user` row (if missing),
 *   2. `authService.register("emailpass", …)` to create the credential,
 *   3. `authService.updateAuthIdentities(...)` to link it to the user.
 *
 * Configure with:
 *   ADMIN_EMAIL    (default "admin@example.com")
 *   ADMIN_PASSWORD (required — the password to set)
 */
export default async function createAdminUser({ container }: { container: MedusaContainer }) {
  const userService = container.resolve<IUserModuleService>(Modules.USER);
  const authService = container.resolve<IAuthModuleService>(Modules.AUTH);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const email = process.env.ADMIN_EMAIL || "admin@example.com";
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    console.error(
      "❌ ADMIN_PASSWORD is not set. Set it to a strong password and re-run " +
        "(e.g. ADMIN_PASSWORD=... medusa exec ./src/scripts/create-admin.ts)."
    );
    return;
  }

  try {
    // 1. Create the user record if it doesn't exist yet.
    const { data: existingUsers } = await query.graph({
      entity: "user",
      fields: ["*"],
      filters: { email },
    });

    let user;
    if (existingUsers.length === 0) {
      const { result: createdUsers } = await createUsersWorkflow(container).run({
        input: {
          users: [{ email, first_name: "Admin", last_name: "User" }],
        },
      });
      user = createdUsers[0];
      console.log(`✅ Admin user created: ${email}`);
    } else {
      user = existingUsers[0];
      console.log(`ℹ️ Admin user already exists: ${email}`);
    }

    // 2. Create the email/password credential (the `auth_identity` the
    //    emailpass provider authenticates against). `register` is idempotent:
    //    it creates the identity when absent, updates the password when the
    //    identity exists but is not yet linked to a user, and reports
    //    "already exists" when the identity is already linked.
    const { authIdentity, error } = await authService.register("emailpass", {
      body: { email, password },
    });

    if (error) {
      if (/already exists/i.test(error)) {
        console.log("ℹ️ Email/password credential already exists — leaving it untouched.");
        return;
      }
      throw new Error(error);
    }

    // 3. Link the credential to the user so a successful login can resolve
    //    the actor from `app_metadata.user_id`.
    await authService.updateAuthIdentities({
      id: authIdentity.id,
      app_metadata: { user_id: user.id },
    });

    console.log(`✅ Admin login enabled for: ${email}`);
    console.log(`🌐 Admin URL: ${new URL("/app", adminBaseUrl).toString()}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ Error creating admin user:", message);
  }
}
