// Gap 19 + Gap 20: GEO audit caching + Brand detection caching in Redis
// These are expensive operations that rarely change:
// - GEO audit: HTTP fetches to target site (llms.txt, robots.txt, homepage)
// - Brand detection with AI: costs an API call per unknown brand
// Cache them aggressively since they don't change as often as AI responses.

import { Redis } from "@upstash/redis";

let _redis: Redis | null = null;
let _redisUrl: string | null = null;

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  if (_redis && _redisUrl === url) return _redis;
  _redis = new Redis({ url, token });
  _redisUrl = url;
  return _redis;
}

// Simple hash (same as cache.ts)
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// ── Gap 19: GEO Audit Caching ──────────────────────────────────────

const GEO_CACHE_TTL = 12 * 60 * 60; // 12 hours — site structure changes slowly

/**
 * Get cached GEO audit result for a URL.
 * Returns null if not cached (caller should run the full audit).
 */
export async function getCachedGeoAudit(siteUrl: string): Promise<any | null> {
  const redis = getRedis();
  if (!redis) return null;
  
  try {
    const key = `asov:geo:${simpleHash(siteUrl.toLowerCase())}`;
    const result = await redis.get(key);
    return result || null;
  } catch {
    return null;
  }
}

/**
 * Cache a GEO audit result.
 */
export async function setCachedGeoAudit(siteUrl: string, result: any): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  
  try {
    const key = `asov:geo:${simpleHash(siteUrl.toLowerCase())}`;
    await redis.set(key, JSON.stringify(result), { ex: GEO_CACHE_TTL });
  } catch {
    // Best effort
  }
}

// ── Gap 20: Brand Detection Caching ────────────────────────────────

const BRAND_CACHE_TTL = 24 * 60 * 60; // 24 hours — brand/category doesn't change

/**
 * Get cached brand detection result for a URL.
 */
export async function getCachedBrandDetection(url: string): Promise<{ brand: string; category: string; confidence: string } | null> {
  const redis = getRedis();
  if (!redis) return null;
  
  try {
    const key = `asov:brand:${simpleHash(url.toLowerCase())}`;
    const result = await redis.get(key);
    if (!result) return null;
    return typeof result === "string" ? JSON.parse(result) : result;
  } catch {
    return null;
  }
}

/**
 * Cache a brand detection result (especially AI-inferred ones to save API calls).
 */
export async function setCachedBrandDetection(
  url: string,
  result: { brand: string; category: string; confidence: string },
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  
  try {
    const key = `asov:brand:${simpleHash(url.toLowerCase())}`;
    await redis.set(key, JSON.stringify(result), { ex: BRAND_CACHE_TTL });
  } catch {
    // Best effort
  }
}
