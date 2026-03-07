import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

/**
 * GET /health
 * Health check endpoint for Railway and other hosting providers.
 * Returns a 200 OK with basic service status.
 */
export const GET = (req: MedusaRequest, res: MedusaResponse) => {
    res.status(200).json({
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || "development",
    });
};
