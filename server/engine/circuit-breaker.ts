// Provider circuit breaker — v3 spec §6
// States: healthy → degraded → tripped → recovering
// Tracks per-provider failures in Redis.
// Degraded providers skipped in Live mode, still attempted in Benchmark.

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

type CircuitState = "healthy" | "degraded" | "tripped";

// Thresholds
const DEGRADED_THRESHOLD = 3;   // 3 failures in window → degraded
const TRIPPED_THRESHOLD = 10;   // 10 failures → tripped (skip entirely)
const FAILURE_WINDOW_SECONDS = 300; // 5-minute rolling window
const TRIP_COOLDOWN_SECONDS = 60;   // After tripped, retry probe after 60s

/**
 * Get the current circuit state for a provider.
 */
export async function getCircuitState(provider: string): Promise<{
  state: CircuitState;
  failures: number;
  lastFailure?: number;
}> {
  const redis = getRedis();
  if (!redis) return { state: "healthy", failures: 0 };
  
  try {
    const key = `asov:circuit:${provider}`;
    const [failures, lastFailureTs] = await Promise.all([
      redis.get<number>(`${key}:failures`) || 0,
      redis.get<number>(`${key}:last_failure`),
    ]);
    
    const failCount = failures || 0;
    
    let state: CircuitState = "healthy";
    if (failCount >= TRIPPED_THRESHOLD) {
      state = "tripped";
    } else if (failCount >= DEGRADED_THRESHOLD) {
      state = "degraded";
    }
    
    return {
      state,
      failures: failCount,
      lastFailure: lastFailureTs || undefined,
    };
  } catch (err) {
    console.error(`[Circuit] Redis error for ${provider}:`, err);
    return { state: "healthy", failures: 0 };
  }
}

/**
 * Record a failure for a provider.
 */
export async function recordFailure(provider: string): Promise<CircuitState> {
  const redis = getRedis();
  if (!redis) return "healthy";
  
  const key = `asov:circuit:${provider}`;
  
  try {
    const newCount = await redis.incr(`${key}:failures`);
    await redis.expire(`${key}:failures`, FAILURE_WINDOW_SECONDS);
    await redis.set(`${key}:last_failure`, Date.now(), { ex: FAILURE_WINDOW_SECONDS });
    
    if (newCount >= TRIPPED_THRESHOLD) {
      console.warn(`[Circuit] ⚠️ ${provider} TRIPPED — ${newCount} failures in ${FAILURE_WINDOW_SECONDS}s window`);
      return "tripped";
    }
    if (newCount >= DEGRADED_THRESHOLD) {
      console.warn(`[Circuit] ⚠️ ${provider} DEGRADED — ${newCount} failures`);
      return "degraded";
    }
    return "healthy";
  } catch (err) {
    console.error(`[Circuit] Redis record failure error for ${provider}:`, err);
    return "healthy";
  }
}

/**
 * Record a success — resets the failure counter.
 */
export async function recordSuccess(provider: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  
  const key = `asov:circuit:${provider}`;
  
  try {
    await redis.del(`${key}:failures`, `${key}:last_failure`);
  } catch (err) {
    console.error(`[Circuit] Redis record success error for ${provider}:`, err);
  }
}

/**
 * Should we skip this provider?
 * In Live mode: skip degraded/tripped providers.
 * In Benchmark mode: only skip tripped (we need all engines for benchmarks).
 */
export async function shouldSkipProvider(
  provider: string,
  mode: "live" | "benchmark" | "test" = "live"
): Promise<{ skip: boolean; reason?: string }> {
  const { state, failures, lastFailure } = await getCircuitState(provider);
  
  if (state === "tripped") {
    // Check if cooldown has passed
    if (lastFailure) {
      const elapsed = (Date.now() - lastFailure) / 1000;
      if (elapsed > TRIP_COOLDOWN_SECONDS) {
        console.log(`[Circuit] ${provider} cooldown passed — allowing probe attempt`);
        return { skip: false };
      }
    }
    return { skip: true, reason: `${provider} circuit tripped (${failures} failures)` };
  }
  
  if (state === "degraded" && mode === "live") {
    return { skip: true, reason: `${provider} degraded (${failures} failures) — skipping in live mode` };
  }
  
  return { skip: false };
}

/**
 * Get status of all providers (for admin/health endpoint).
 */
export async function getAllCircuitStates(): Promise<Record<string, { state: CircuitState; failures: number }>> {
  const providers = ["chatgpt", "gemini", "claude", "grok", "perplexity"];
  const results: Record<string, { state: CircuitState; failures: number }> = {};
  
  for (const p of providers) {
    results[p] = await getCircuitState(p);
  }
  
  return results;
}
