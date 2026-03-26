// Gap 2: Concurrency control
// Weighted load cap + per-provider semaphores + tier priority
// Prevents overloading any single provider and ensures Agency > Monitor > Snapshot priority.

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

// Per-provider concurrent request limits
// Protects low-budget providers (Grok $5, Perplexity $5) from burst abuse
const PROVIDER_MAX_CONCURRENT: Record<string, number> = {
  chatgpt: 8,      // OpenAI can handle high concurrency
  gemini: 8,       // Gemini is free tier, generous limits
  claude: 4,       // Anthropic, moderate
  grok: 3,         // $5 budget — be careful
  perplexity: 3,   // $5 budget — be careful
};

// Tier priority weights (higher = more priority)
// When system is loaded, lower-tier requests wait
const TIER_PRIORITY: Record<string, number> = {
  agency: 3,    // Always gets through first
  monitor: 2,   // Paid tier, second priority
  snapshot: 1,  // Free tier, yields to paid
};

// Global weighted load cap: max total "weight units" across all concurrent audits
// agency=5, monitor=3, snapshot=1
const GLOBAL_MAX_WEIGHT = 15;

const TIER_WEIGHT: Record<string, number> = {
  agency: 5,
  monitor: 3,
  snapshot: 1,
};

const SEMAPHORE_TTL = 120; // 2 minutes — auto-cleanup if process crashes

/**
 * Acquire a provider-level semaphore.
 * Returns true if the provider has capacity, false if at limit.
 */
export async function acquireProviderSlot(provider: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true; // Fail open if Redis unavailable
  
  const key = `asov:sem:${provider}`;
  const max = PROVIDER_MAX_CONCURRENT[provider] || 5;
  
  try {
    const current = await redis.incr(key);
    if (current === 1) {
      // First acquisition — set TTL
      await redis.expire(key, SEMAPHORE_TTL);
    }
    if (current > max) {
      // Over limit — release and reject
      await redis.decr(key);
      return false;
    }
    return true;
  } catch {
    return true; // Fail open
  }
}

/**
 * Release a provider-level semaphore slot.
 */
export async function releaseProviderSlot(provider: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  
  try {
    const key = `asov:sem:${provider}`;
    const val = await redis.decr(key);
    // Don't go below 0
    if (val < 0) await redis.set(key, 0, { ex: SEMAPHORE_TTL });
  } catch {
    // Best effort
  }
}

/**
 * Check if the global weighted load cap allows another audit of the given tier.
 * Prevents the system from running too many expensive audits simultaneously.
 */
export async function checkGlobalCapacity(tier: string): Promise<{ allowed: boolean; currentWeight: number; maxWeight: number }> {
  const redis = getRedis();
  if (!redis) return { allowed: true, currentWeight: 0, maxWeight: GLOBAL_MAX_WEIGHT };
  
  try {
    const key = "asov:global_weight";
    const current = (await redis.get<number>(key)) || 0;
    const tierWeight = TIER_WEIGHT[tier] || 1;
    
    // Agency always gets in (tier priority)
    if (tier === "agency") {
      return { allowed: true, currentWeight: current, maxWeight: GLOBAL_MAX_WEIGHT };
    }
    
    // Monitor gets in if under 80% capacity
    if (tier === "monitor" && current + tierWeight <= GLOBAL_MAX_WEIGHT * 0.8) {
      return { allowed: true, currentWeight: current, maxWeight: GLOBAL_MAX_WEIGHT };
    }
    
    // Snapshot only if under 60% capacity
    if (tier === "snapshot" && current + tierWeight <= GLOBAL_MAX_WEIGHT * 0.6) {
      return { allowed: true, currentWeight: current, maxWeight: GLOBAL_MAX_WEIGHT };
    }
    
    // Over capacity for this tier
    if (current + tierWeight > GLOBAL_MAX_WEIGHT) {
      return { allowed: false, currentWeight: current, maxWeight: GLOBAL_MAX_WEIGHT };
    }
    
    return { allowed: true, currentWeight: current, maxWeight: GLOBAL_MAX_WEIGHT };
  } catch {
    return { allowed: true, currentWeight: 0, maxWeight: GLOBAL_MAX_WEIGHT };
  }
}

/**
 * Acquire global weight for an audit run.
 */
export async function acquireGlobalWeight(tier: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  
  try {
    const key = "asov:global_weight";
    const weight = TIER_WEIGHT[tier] || 1;
    await redis.incrbyfloat(key, weight);
    await redis.expire(key, SEMAPHORE_TTL);
  } catch {
    // Best effort
  }
}

/**
 * Release global weight after audit completes.
 */
export async function releaseGlobalWeight(tier: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  
  try {
    const key = "asov:global_weight";
    const weight = TIER_WEIGHT[tier] || 1;
    const current = await redis.incrbyfloat(key, -weight);
    if (current < 0) await redis.set(key, 0, { ex: SEMAPHORE_TTL });
  } catch {
    // Best effort
  }
}
