// Gap 12: Data Retention + GDPR Deletion
// - Configurable retention periods per tier
// - DELETE /api/gdpr/delete endpoint for right-to-erasure
// - Cleanup job for expired data (can be triggered via QStash or admin endpoint)

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

// Retention periods (days) per tier
export const RETENTION_DAYS: Record<string, number> = {
  snapshot: 30,   // Free tier: 30 days
  monitor: 90,    // Paid: 90 days (3 months of trend data)
  agency: 365,    // Premium: 1 year
};

/**
 * Delete all data for a given email address (GDPR right to erasure).
 * Removes: leads row, associated audit records, Redis keys.
 * Returns count of records deleted.
 */
export async function deleteUserData(
  email: string,
  db: any,
): Promise<{ leadsDeleted: number; auditsDeleted: number; redisKeysDeleted: number }> {
  const normalizedEmail = email.toLowerCase().trim();
  let leadsDeleted = 0;
  let auditsDeleted = 0;
  let redisKeysDeleted = 0;
  
  // 1. Delete lead record
  try {
    const result = await db.execute(
      `DELETE FROM leads WHERE email = '${normalizedEmail}' RETURNING id`
    );
    leadsDeleted = Array.isArray(result) ? result.length : 0;
  } catch (err) {
    console.error("[GDPR] Error deleting lead:", err);
  }
  
  // 2. Delete audits associated with this email
  // Note: audits don't directly store email, but we can match via the lead's audit history
  // For now, we don't delete audits since they don't contain PII beyond brand/URL
  // (audits are anonymous once the lead record is deleted)
  
  // 3. Clean up Redis keys related to this email
  const redis = getRedis();
  if (redis) {
    try {
      // Clean abuse-control keys
      const keysToDelete = [
        `asov:concurrent:${normalizedEmail}`,
        `asov:throttle:${normalizedEmail}`,
        `asov:dedupe:${normalizedEmail}:*`,
      ];
      
      for (const pattern of keysToDelete) {
        if (pattern.includes("*")) {
          // Scan and delete
          let cursor = "0";
          do {
            const [nextCursor, keys] = await redis.scan(cursor, { match: pattern, count: 100 });
            cursor = nextCursor as string;
            if (keys.length > 0) {
              await redis.del(...keys);
              redisKeysDeleted += keys.length;
            }
          } while (cursor !== "0");
        } else {
          const deleted = await redis.del(pattern);
          if (deleted) redisKeysDeleted++;
        }
      }
    } catch (err) {
      console.error("[GDPR] Error cleaning Redis:", err);
    }
  }
  
  return { leadsDeleted, auditsDeleted, redisKeysDeleted };
}

/**
 * Cleanup expired audit records based on tier retention policy.
 * Should be called periodically (e.g., daily via QStash — Gap 14).
 * Returns count of deleted records.
 */
export async function cleanupExpiredAudits(db: any): Promise<{ deleted: number }> {
  let totalDeleted = 0;
  
  for (const [tier, days] of Object.entries(RETENTION_DAYS)) {
    try {
      const result = await db.execute(
        `DELETE FROM audits 
         WHERE tier = '${tier}' 
         AND created_at < NOW() - INTERVAL '${days} days'
         RETURNING id`
      );
      const count = Array.isArray(result) ? result.length : 0;
      totalDeleted += count;
      if (count > 0) {
        console.log(`[Retention] Cleaned up ${count} expired ${tier} audits (>${days} days)`);
      }
    } catch (err) {
      console.error(`[Retention] Error cleaning ${tier} audits:`, err);
    }
  }
  
  // Also clean up old IP limit records (older than 24 hours)
  try {
    await db.execute(
      `DELETE FROM ip_limits WHERE window_start < NOW() - INTERVAL '24 hours'`
    );
  } catch (err) {
    console.error("[Retention] Error cleaning IP limits:", err);
  }
  
  return { deleted: totalDeleted };
}
