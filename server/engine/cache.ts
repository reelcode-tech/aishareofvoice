// Upstash Redis cache for AI engine responses
// Replaces in-memory LRU — persists across deploys, shared across instances
// Tiered TTL: Snapshot=24hr, Monitor=6hr, Agency=1hr (Live) / 0 (Benchmark)

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

// Rich cache key: tier:mode:engine:queryHash
function buildKey(engine: string, query: string, tier: string = "snapshot"): string {
  const normalized = query.toLowerCase().trim();
  return `asov:cache:${tier}:${engine}:${normalized}`;
}

export async function getCached(
  engine: string,
  query: string,
  tier: string = "snapshot"
): Promise<string | null> {
  try {
    const redis = getRedis();
    if (!redis) return null;
    const key = buildKey(engine, query, tier);
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
  tier: string = "snapshot"
): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) return;
    const key = buildKey(engine, query, tier);
    const ttl = TIER_TTL[tier] || TIER_TTL.snapshot;
    await redis.set(key, response, { ex: ttl });
  } catch (err) {
    console.error("[Cache] Redis SET error:", err);
    // Don't throw — caching is best-effort
  }
}

// For tracked benchmarks: skip cache entirely (measurement integrity)
export async function getTrackedBenchmark(
  _engine: string,
  _query: string
): Promise<null> {
  return null; // Always miss — fresh fetch required
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
      const [nextCursor, keys] = await redis.scan(cursor, { match: "asov:cache:*", count: 100 });
      cursor = nextCursor as string;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== "0");
  } catch (err) {
    console.error("[Cache] Redis CLEAR error:", err);
  }
}
