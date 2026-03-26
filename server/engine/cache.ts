// Upstash Redis cache for AI engine responses
// Replaces in-memory LRU — persists across deploys, shared across instances
// Tiered TTL: Snapshot=24hr, Monitor=6hr, Agency=1hr (Live) / 0 (Benchmark)
// Gap 17: Short hashed cache keys including model+locale

import { Redis } from "@upstash/redis";

let _redis: Redis | null = null;
let _redisUrl: string | null = null;

function getRedis(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.warn("[Cache] Upstash credentials missing — cache disabled");
    return null as any;
  }
  // Reuse if same credentials (Workers-compatible)
  if (_redis && _redisUrl === url) return _redis;
  _redis = new Redis({ url, token });
  _redisUrl = url;
  return _redis;
}

// TTL per tier (in seconds)
const TIER_TTL: Record<string, number> = {
  snapshot: 24 * 60 * 60,  // 24 hours — free tier, aggressive caching
  monitor: 6 * 60 * 60,    // 6 hours — paid, fresher data
  agency: 1 * 60 * 60,     // 1 hour — premium, near-fresh
};

// Gap 17: Simple hash function for short cache keys (Workers-compatible, no crypto needed)
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  // Return as unsigned hex string (8 chars)
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// Gap 17: Rich cache key: tier:engine:model:locale:queryHash
// Shorter than raw query text, and includes model + locale for correctness
function buildKey(
  engine: string,
  query: string,
  tier: string = "snapshot",
  model: string = "",
  locale: string = "en",
): string {
  const normalized = query.toLowerCase().trim();
  const queryHash = simpleHash(normalized);
  return `asov:c:${tier}:${engine}:${model || "default"}:${locale}:${queryHash}`;
}

export async function getCached(
  engine: string,
  query: string,
  tier: string = "snapshot",
  model: string = "",
  locale: string = "en",
): Promise<string | null> {
  try {
    const redis = getRedis();
    if (!redis) return null;
    const key = buildKey(engine, query, tier, model, locale);
    const result = await redis.get<string>(key);
    return result;
  } catch (err) {
    console.error("[Cache] Redis GET error:", err);
    return null; // Cache miss on error — never block the request
  }
}

export async function setCached(
  engine: string,
  query: string,
  response: string,
  tier: string = "snapshot",
  model: string = "",
  locale: string = "en",
): Promise<void> {
  if (!response || response.trim().length < 10) return; // Don't cache empty/trivial responses
  try {
    const redis = getRedis();
    if (!redis) return;
    const key = buildKey(engine, query, tier, model, locale);
    const ttl = TIER_TTL[tier] || TIER_TTL.snapshot;
    await redis.set(key, response, { ex: ttl });
  } catch (err) {
    console.error("[Cache] Redis SET error:", err);
    // Don't throw — caching is best-effort
  }
}

// Gap 1: For benchmark mode — skip cache entirely (measurement integrity)
// "the whole purpose of this app is to measure results from fresh AI runs"
export async function getForMode(
  mode: "live" | "benchmark",
  engine: string,
  query: string,
  tier: string = "snapshot",
  model: string = "",
  locale: string = "en",
): Promise<string | null> {
  if (mode === "benchmark") return null; // Always fresh for benchmarks
  return getCached(engine, query, tier, model, locale);
}

export async function setForMode(
  mode: "live" | "benchmark",
  engine: string,
  query: string,
  response: string,
  tier: string = "snapshot",
  model: string = "",
  locale: string = "en",
): Promise<void> {
  // Benchmark mode: still store but with a different prefix for comparison
  if (mode === "benchmark") {
    try {
      const redis = getRedis();
      if (!redis) return;
      // Store benchmark responses separately — never served as cache hits
      const key = `asov:bm:${tier}:${engine}:${simpleHash(query.toLowerCase().trim())}`;
      await redis.set(key, response, { ex: 7 * 24 * 60 * 60 }); // 7 day retention for benchmarks
    } catch (err) {
      console.error("[Cache] Redis benchmark SET error:", err);
    }
    return;
  }
  return setCached(engine, query, response, tier, model, locale);
}

// Stats for monitoring
export async function getCacheStats(): Promise<{ size: number } | null> {
  try {
    const redis = getRedis();
    if (!redis) return null;
    const size = await redis.dbsize();
    return { size };
  } catch {
    return null;
  }
}

// Flush cache (admin operation)
export async function clearCache(): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) return;
    // Only clear our namespace
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(cursor, { match: "asov:c:*", count: 100 });
      cursor = nextCursor as string;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== "0");
  } catch (err) {
    console.error("[Cache] Redis CLEAR error:", err);
  }
}
