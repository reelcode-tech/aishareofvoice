import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "@hono/node-server/serve-static";
import { serve } from "@hono/node-server";
import { createApiRoutes } from "./routes";
import { DatabaseStorage } from "./storage";

// Load .env in development
if (process.env.NODE_ENV !== "production") {
  const { config } = await import("dotenv");
  config();
}

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// Initialize storage with database URL
const storage = new DatabaseStorage(process.env.DATABASE_URL);

// Mount API routes
const apiRoutes = createApiRoutes(storage);
app.route("/api", apiRoutes);

// Health check
app.get("/health", (c) => c.json({ 
  status: "ok", 
  timestamp: new Date().toISOString(),
  version: "2.0.0",
}));

// Serve static frontend in production
if (process.env.NODE_ENV === "production") {
  app.use("/*", serveStatic({ root: "./dist/public" }));
  // SPA fallback — serve index.html for all non-API, non-static routes
  app.get("*", serveStatic({ root: "./dist/public", path: "index.html" }));
}

// Start server
const port = parseInt(process.env.PORT || "5000");
console.log(`[ASOV] Starting server on port ${port}...`);
console.log(`[ASOV] Environment: ${process.env.NODE_ENV || "development"}`);
console.log(`[ASOV] Database: ${process.env.DATABASE_URL ? "Supabase Postgres" : "NOT SET"}`);
console.log(`[ASOV] Cache: ${process.env.UPSTASH_REDIS_REST_URL ? "Upstash Redis" : "NOT SET"}`);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[ASOV] Server running at http://localhost:${info.port}`);
});

export default app;
