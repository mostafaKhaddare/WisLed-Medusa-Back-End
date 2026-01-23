import { defineMiddlewares } from "@medusajs/framework";
import { storeSearchRoutesMiddlewares } from "./search/middlewares";

export default defineMiddlewares([...storeSearchRoutesMiddlewares]);
