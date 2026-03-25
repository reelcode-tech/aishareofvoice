// Cloudflare Workers entry point
// Uses Hono's native Workers support — no @hono/node-server needed
// Env vars come from Workers secrets, not process.env

import { Hono } from "hono";
import { cors } from "hono/cors";
import { createApiRoutes } from "./routes";
import { LazyStorage } from "./storage";

// Workers env bindings type
interface Env {
  DATABASE_URL: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  OPENAI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  GOOGLE_GEMINI_API_KEY: string;
  XAI_API_KEY: string;
  PERPLEXITY_API_KEY: string;
  QSTASH_URL?: string;
  QSTASH_TOKEN?: string;
}

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "x-asov-request-id"],
  exposeHeaders: ["x-asov-request-id"],
}));

// Health check — no DB needed
app.get("/api/health", (c) => c.json({ 
  status: "ok", 
  timestamp: new Date().toISOString(),
  version: "2.1.0",
  runtime: "cloudflare-workers",
  features: [
    "idempotency",
    "spend-tracking",
    "circuit-breaker",
    "abuse-controls",
    "structured-logging",
    "auto-migration",
  ],
}));

// Auto-migrate: create tables if they don't exist
// Uses IF NOT EXISTS so it's safe to run on every deploy
app.get("/api/migrate", async (c) => {
  try {
    const env = c.env;
    // Bridge env first
    process.env.DATABASE_URL = env.DATABASE_URL;
    
    const { getDb } = await import("./storage");
    const db = getDb();
    
    // Run migrations using raw SQL
    await db.execute(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        audit_count INTEGER NOT NULL DEFAULT 0,
        first_audit_at TIMESTAMP,
        last_audit_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS ip_limits (
        id SERIAL PRIMARY KEY,
        ip_address TEXT NOT NULL,
        audit_count INTEGER NOT NULL DEFAULT 0,
        window_start TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS audits (
        id SERIAL PRIMARY KEY,
        brand_name TEXT NOT NULL,
        brand_url TEXT NOT NULL,
        category TEXT NOT NULL,
        tier TEXT NOT NULL DEFAULT 'snapshot',
        language TEXT NOT NULL DEFAULT 'en',
        overall_score INTEGER,
        overall_grade TEXT,
        confidence_low DOUBLE PRECISION,
        confidence_high DOUBLE PRECISION,
        margin_of_error TEXT,
        observations INTEGER,
        engine_results JSONB,
        competitors JSONB,
        query_results JSONB,
        sentiment_data JSONB,
        citation_data JSONB,
        geo_audit JSONB,
        recommendations JSONB,
        custom_competitors JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_audits_brand ON audits(brand_name);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_audits_created ON audits(created_at DESC);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_audits_brand_created ON audits(brand_name, created_at DESC);`);
    
    return c.json({ 
      status: "ok", 
      message: "All tables created/verified",
      tables: ["leads", "ip_limits", "audits"],
      indexes: ["idx_audits_brand", "idx_audits_created", "idx_audits_brand_created"],
    });
  } catch (error: any) {
    console.error("[Migrate] Error:", error);
    return c.json({ status: "error", error: error.message }, 500);
  }
});

// Bridge Workers env bindings → process.env before any API handler runs
app.use("/api/*", async (c, next) => {
  const env = c.env;
  process.env.DATABASE_URL = env.DATABASE_URL;
  process.env.UPSTASH_REDIS_REST_URL = env.UPSTASH_REDIS_REST_URL;
  process.env.UPSTASH_REDIS_REST_TOKEN = env.UPSTASH_REDIS_REST_TOKEN;
  process.env.OPENAI_API_KEY = env.OPENAI_API_KEY;
  process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
  process.env.GOOGLE_GEMINI_API_KEY = env.GOOGLE_GEMINI_API_KEY;
  process.env.XAI_API_KEY = env.XAI_API_KEY;
  process.env.PERPLEXITY_API_KEY = env.PERPLEXITY_API_KEY;
  await next();
});

// Mount API routes with a lazy storage proxy that defers DB connection
// until the first actual method call (by which time process.env is set)
const storage = new LazyStorage();
app.route("/api", createApiRoutes(storage));

export default app;
