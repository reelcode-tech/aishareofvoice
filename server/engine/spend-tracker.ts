// Daily spend tracking + circuit breaker via Upstash Redis
// Prevents runaway API costs. Hard ceiling per day.
// v3 spec §3d: Redis key `asov:spend:{date}` tracks daily cost
// When ceiling hit: reject Snapshot, queue Monitor, allow Agency only.

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

// Estimated cost per provider call (in cents, not dollars)
// Updated with real cost data from API responses:
// - Grok: ~$0.013 per call (1,328,250 usd_ticks = ~1.3¢, includes reasoning tokens)
// - Perplexity: ~$0.50 per call ($0.005 request_cost base — EXPENSIVE for small budgets)
// - Claude: ~$0.03 per call (haiku is cheap)
// - ChatGPT: ~$0.06 per call (gpt-4o-mini)
// - Gemini: ~$0.02 per call (flash is cheapest)
const PROVIDER_COST_CENTS: Record<string, number> = {
  chatgpt: 0.06,     // gpt-4o-mini: ~$0.15/1M input + $0.60/1M output
  gemini: 0.02,      // gemini-2.0-flash: cheapest provider
  claude: 0.03,      // claude-3-haiku: $0.25/1M input + $1.25/1M output
  grok: 1.50,        // grok-3-mini-fast: ~$0.013/call BUT reasoning tokens are expensive
  perplexity: 0.50,  // sonar: $0.005/request base cost — most expensive per-call
};

// Per-tier estimated total cost (all queries × all engines)
// Snapshot: 12 queries × 2 engines = 24 calls → ~$0.02
// Monitor:  25 queries × 3 engines = 75 calls → ~$0.05
// Agency:   30 queries × 5 engines = 150 calls → ~$0.10
const TIER_WEIGHT: Record<string, number> = {
  snapshot: 1,
  monitor: 3,
  agency: 5,
};

// Daily hard ceiling in cents
// With $5 on Grok + $5 on Perplexity, we need to be very conservative.
// $5 Perplexity ≈ 1000 calls ($0.005/call), $5 Grok ≈ 375 calls (~$0.013/call)
// A snapshot audit = 12 queries × 2 engines = 24 calls
// A monitor audit = 25 queries × 3 engines = 75 calls  
// An agency audit = 30 queries × 5 engines = 150 calls (30 Grok + 30 Perplexity = ~$0.54)
// Budget: ~9 agency audits before hitting Grok limit, ~18 before Perplexity limit
// Set daily ceiling to $2/day = 200 cents (preserves budget over multiple days of testing)
const DAILY_CEILING_CENTS = 200;

// Get today's date key in UTC (e.g., "2026-03-25")
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Record spend for a provider call.
 * Called after each successful AI API call.
 */
export async function recordSpend(provider: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  
  const cost = PROVIDER_COST_CENTS[provider] || 0.05;
  const key = `asov:spend:${todayKey()}`;
  
  try {
    await redis.incrbyfloat(key, cost);
    // Auto-expire after 48 hours (cleanup)
    await redis.expire(key, 48 * 60 * 60);
  } catch (err) {
    console.error("[Spend] Redis error:", err);
  }
}

/**
 * Record the estimated cost for an entire audit up front.
 * More accurate than per-call because we know tier + engine count.
 */
export async function recordAuditSpend(
  tier: string,
  queryCount: number,
  engineCount: number
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  
  // Rough estimate: avg cost per call × total calls
  const avgCostPerCall = 0.06; // cents
  const totalCost = queryCount * engineCount * avgCostPerCall;
  const key = `asov:spend:${todayKey()}`;
  
  try {
    await redis.incrbyfloat(key, totalCost);
    await redis.expire(key, 48 * 60 * 60);
  } catch (err) {
    console.error("[Spend] Redis record audit error:", err);
  }
}

/**
 * Check if the daily spend ceiling allows this tier to proceed.
 * Returns { allowed, currentSpendCents, ceilingCents }
 */
export async function checkSpendBudget(
  tier: string
): Promise<{ allowed: boolean; currentSpendCents: number; ceilingCents: number; reason?: string }> {
  const redis = getRedis();
  if (!redis) return { allowed: true, currentSpendCents: 0, ceilingCents: DAILY_CEILING_CENTS };
  
  const key = `asov:spend:${todayKey()}`;
  
  try {
    const current = await redis.get<number>(key) || 0;
    
    // Agency always allowed (premium tier)
    if (tier === "agency") {
      return { allowed: true, currentSpendCents: current, ceilingCents: DAILY_CEILING_CENTS };
    }
    
    // At 60% ceiling: block snapshot (free tier gets cut first)
    if (current >= DAILY_CEILING_CENTS * 0.6 && tier === "snapshot") {
      return {
        allowed: false,
        currentSpendCents: current,
        ceilingCents: DAILY_CEILING_CENTS,
        reason: "Daily API budget nearly exhausted. Free audits temporarily paused. Upgrade to Monitor for priority access.",
      };
    }
    
    // At 85% ceiling: block snapshot + monitor
    if (current >= DAILY_CEILING_CENTS * 0.85) {
      if (tier === "monitor") {
        return {
          allowed: false,
          currentSpendCents: current,
          ceilingCents: DAILY_CEILING_CENTS,
          reason: "Daily API budget reached. Monitor audits temporarily queued. Try again later.",
        };
      }
      if (tier === "snapshot") {
        return {
          allowed: false,
          currentSpendCents: current,
          ceilingCents: DAILY_CEILING_CENTS,
          reason: "Daily API budget exhausted. Try again tomorrow.",
        };
      }
    }
    
    // At 100% ceiling: block everything except agency
    if (current >= DAILY_CEILING_CENTS && tier !== "agency") {
      return {
        allowed: false,
        currentSpendCents: current,
        ceilingCents: DAILY_CEILING_CENTS,
        reason: "Daily API budget exhausted. Try again tomorrow.",
      };
    }
    
    return { allowed: true, currentSpendCents: current, ceilingCents: DAILY_CEILING_CENTS };
  } catch (err) {
    console.error("[Spend] Redis check error:", err);
    // Fail open — don't block audits if Redis is down
    return { allowed: true, currentSpendCents: 0, ceilingCents: DAILY_CEILING_CENTS };
  }
}

/**
 * Get today's total spend (for admin/monitoring)
 */
export async function getTodaySpend(): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  
  try {
    return (await redis.get<number>(`asov:spend:${todayKey()}`)) || 0;
  } catch {
    return 0;
  }
}
