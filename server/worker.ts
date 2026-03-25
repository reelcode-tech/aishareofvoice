// Cloudflare Workers entry point
// Uses Hono's native Workers support — no @hono/node-server needed
// Env vars come from Workers secrets, not process.env

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
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
app.use("*", logger());
app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// Health check — no DB needed
app.get("/api/health", (c) => c.json({ 
  status: "ok", 
  timestamp: new Date().toISOString(),
  version: "2.0.0",
  runtime: "cloudflare-workers",
}));

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
