import { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

export default async function createPublishableApiKey({ container }: { container: MedusaContainer }) {
  const apiKeyModuleService = container.resolve(Modules.API_KEY);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  
  try {
    // Check if publishable API key already exists
    const { data: existingKeys } = await query.graph({
      entity: "api_key",
      fields: ["*"],
      filters: {
        type: "publishable",
        title: "Storefront API Key"
      }
    });
    
    if (existingKeys.length === 0) {
      const [apiKey] = await apiKeyModuleService.createApiKeys([
        {
          title: "Storefront API Key",
          type: "publishable",
          created_by: ""
        }
      ]);
      
      console.log("✅ Publishable API Key created:");
      console.log(`🔑 Key: ${apiKey.token}`);
      console.log("📝 Add this to your storefront requests as x-publishable-api-key header");
      return apiKey;
    } else {
      console.log("ℹ️ Publishable API Key already exists:");
      console.log(`🔑 Key: ${existingKeys[0].token}`);
      return existingKeys[0];
    }
  } catch (error) {
    console.error("❌ Error creating publishable API key:", error.message);
    throw error;
  }
}
