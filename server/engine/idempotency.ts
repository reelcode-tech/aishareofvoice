// Request deduplication via Redis
// v3 spec §1: Fingerprint requests → dedupe window prevents double-clicks,
// tab refreshes, and retries from creating duplicate audits.
// Live audit: 5-min dedupe window
// Tracked benchmark: 60-min dedupe window

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

// Dedupe window per mode (seconds)
const DEDUPE_TTL: Record<string, number> = {
  live: 5 * 60,        // 5 minutes — prevents double-clicks / refreshes
  benchmark: 60 * 60,  // 60 minutes — prevents re-running scheduled benchmarks
};

/**
 * Build a fingerprint from the audit request.
 * Same brand + URL + tier + language = same request.
 */
function fingerprint(params: {
  url: string;
  brandName?: string;
  tier: string;
  language?: string;
  email?: string;
}): string {
  const parts = [
    params.url.toLowerCase().replace(/\/$/, ""),
    (params.brandName || "").toLowerCase(),
    params.tier,
    params.language || "en",
    (params.email || "").toLowerCase(),
  ];
  // Simple hash: join + encode. No need for crypto in Workers for this.
  return btoa(parts.join("|")).replace(/[=+/]/g, "").slice(0, 32);
}

/**
 * Check if this exact audit request was already submitted recently.
 * Returns the existing audit ID if found (deduplicated), or null if fresh.
 */
export async function checkDedupe(params: {
  url: string;
  brandName?: string;
  tier: string;
  language?: string;
  email?: string;
  mode?: string;
}): Promise<{ deduplicated: boolean; existingAuditId?: number }> {
  const redis = getRedis();
  if (!redis) return { deduplicated: false };
  
  const fp = fingerprint(params);
  const key = `asov:dedupe:${fp}`;
  
  try {
    const existing = await redis.get<string>(key);
    if (existing) {
      console.log(`[Dedupe] Hit — request fingerprint ${fp.slice(0, 8)} already in-flight or recently completed (audit ${existing})`);
      return { deduplicated: true, existingAuditId: parseInt(existing) || undefined };
    }
    return { deduplicated: false };
  } catch (err) {
    console.error("[Dedupe] Redis error:", err);
    return { deduplicated: false }; // Fail open
  }
}

/**
 * Mark this request as in-flight. Called right before starting the audit.
 * The value is "pending" initially, then updated to the audit ID on completion.
 */
export async function markInFlight(params: {
  url: string;
  brandName?: string;
  tier: string;
  language?: string;
  email?: string;
  mode?: string;
}): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  
  const fp = fingerprint(params);
  const key = `asov:dedupe:${fp}`;
  const ttl = DEDUPE_TTL[params.mode || "live"] || DEDUPE_TTL.live;
  
  try {
    await redis.set(key, "pending", { ex: ttl });
  } catch (err) {
    console.error("[Dedupe] Redis set error:", err);
  }
}

/**
 * Update the dedupe entry with the completed audit ID.
 * This way, deduped requests can return the existing result.
 */
export async function markCompleted(params: {
  url: string;
  brandName?: string;
  tier: string;
  language?: string;
  email?: string;
  mode?: string;
}, auditId: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  
  const fp = fingerprint(params);
  const key = `asov:dedupe:${fp}`;
  const ttl = DEDUPE_TTL[params.mode || "live"] || DEDUPE_TTL.live;
  
  try {
    await redis.set(key, String(auditId), { ex: ttl });
  } catch (err) {
    console.error("[Dedupe] Redis update error:", err);
  }
}
