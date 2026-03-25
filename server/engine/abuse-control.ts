// Abuse controls beyond basic email gating + IP limits
// v3 spec §8: disposable email detection, concurrent audit limits,
// email-domain blacklist, progressive throttling

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

// Known disposable email domains (top 50+ most common)
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.info", "grr.la",
  "guerrillamail.net", "guerrillamail.org", "guerrillamail.de",
  "tempmail.com", "temp-mail.org", "throwaway.email",
  "yopmail.com", "yopmail.fr", "dispostable.com",
  "sharklasers.com", "guerrillamailblock.com", "10minutemail.com",
  "10minute.email", "maildrop.cc", "mailnesia.com",
  "trashmail.com", "trashmail.me", "trashmail.net",
  "discard.email", "discardmail.com", "discardmail.de",
  "fakeinbox.com", "mailcatch.com", "getnada.com",
  "emailondeck.com", "tempr.email", "binkmail.com",
  "safetymail.info", "filzmail.com", "inboxkitten.com",
  "burnermail.io", "jetable.org", "tmpmail.net",
  "tmpmail.org", "mohmal.com", "tempail.com",
  "emailfake.com", "crazymailing.com", "mytemp.email",
  "spamgourmet.com", "mintemail.com", "mailnator.com",
  "anonbox.net", "anonymbox.com", "fantasymail.de",
  "harakirimail.com", "mailexpire.com", "mailforspam.com",
  "mailinater.com", "mailismagic.com", "mailmetrash.com",
  "mailscrap.com", "mailzilla.com", "nomail.xl.cx",
  "objectmail.com", "proxymail.eu", "rcpt.at",
  "reallymymail.com", "recode.me", "spamfree24.org",
  "spaml.com", "tempomail.fr", "trash-amil.com",
  "trashymail.com", "uggsrock.com", "wegwerfmail.de",
  "wegwerfmail.net", "wh4f.org", "yepmail.net",
]);

// Custom blocked domains (add your own)
const BLOCKED_DOMAINS = new Set<string>([
  // Add domains that consistently abuse the free tier
]);

/**
 * Check if an email is from a disposable/temporary provider
 */
export function isDisposableEmail(email: string): boolean {
  const domain = email.toLowerCase().split("@")[1];
  if (!domain) return false;
  return DISPOSABLE_DOMAINS.has(domain) || BLOCKED_DOMAINS.has(domain);
}

/**
 * Check concurrent audit limit — only 1 audit in-flight per email at a time.
 * Prevents someone from spamming 10 parallel audit requests.
 */
export async function checkConcurrentLimit(email: string): Promise<{ allowed: boolean }> {
  const redis = getRedis();
  if (!redis) return { allowed: true };
  
  const key = `asov:concurrent:${email.toLowerCase()}`;
  
  try {
    const current = await redis.get<number>(key) || 0;
    if (current >= 1) {
      return { allowed: false };
    }
    return { allowed: true };
  } catch (err) {
    console.error("[Abuse] Redis concurrent check error:", err);
    return { allowed: true }; // Fail open
  }
}

/**
 * Increment concurrent audit counter for an email.
 * Auto-expires after 120 seconds (safety net if audit crashes).
 */
export async function incrementConcurrent(email: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  
  const key = `asov:concurrent:${email.toLowerCase()}`;
  try {
    await redis.incr(key);
    await redis.expire(key, 120); // 2-minute safety TTL
  } catch (err) {
    console.error("[Abuse] Redis concurrent incr error:", err);
  }
}

/**
 * Decrement concurrent audit counter (audit completed/failed).
 */
export async function decrementConcurrent(email: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  
  const key = `asov:concurrent:${email.toLowerCase()}`;
  try {
    const val = await redis.decr(key);
    if (val <= 0) await redis.del(key);
  } catch (err) {
    console.error("[Abuse] Redis concurrent decr error:", err);
  }
}

/**
 * Progressive throttling: as an email uses more audits,
 * enforce increasing cooldowns between audits.
 * 
 * 1st audit: no cooldown
 * 2nd audit: 30-second cooldown
 * 3rd audit: 5-minute cooldown
 */
export async function checkProgressiveThrottle(
  email: string,
  auditCount: number
): Promise<{ allowed: boolean; waitSeconds?: number }> {
  const redis = getRedis();
  if (!redis) return { allowed: true };
  
  // No throttle for first audit
  if (auditCount <= 0) return { allowed: true };
  
  const key = `asov:throttle:${email.toLowerCase()}`;
  
  try {
    const lastAuditTs = await redis.get<number>(key);
    if (!lastAuditTs) return { allowed: true };
    
    const elapsedSeconds = (Date.now() - lastAuditTs) / 1000;
    
    // Progressive cooldowns
    let requiredCooldown = 0;
    if (auditCount >= 2) requiredCooldown = 30;    // 30 seconds after 2nd
    if (auditCount >= 3) requiredCooldown = 300;   // 5 minutes for 3rd+
    
    if (elapsedSeconds < requiredCooldown) {
      return {
        allowed: false,
        waitSeconds: Math.ceil(requiredCooldown - elapsedSeconds),
      };
    }
    
    return { allowed: true };
  } catch (err) {
    console.error("[Abuse] Redis throttle check error:", err);
    return { allowed: true };
  }
}

/**
 * Record that an audit was just started (for progressive throttling).
 */
export async function recordAuditTimestamp(email: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  
  const key = `asov:throttle:${email.toLowerCase()}`;
  try {
    await redis.set(key, Date.now(), { ex: 600 }); // 10-minute TTL
  } catch (err) {
    console.error("[Abuse] Redis timestamp error:", err);
  }
}
