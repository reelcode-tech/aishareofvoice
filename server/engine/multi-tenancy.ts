// Gap 13: Multi-tenancy — Org/Account model for Agency tier
// Agency customers manage multiple brands under one account.
// This module provides the data model and validation helpers.
// Full DB migration happens separately; this is the logic layer.

// Note: For the initial launch we store org data in a lightweight Redis structure
// rather than creating new Postgres tables. This keeps things simple during
// the "land 3 Agency customers manually" phase. When we have paying customers,
// we'll add proper Postgres tables.

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

export interface OrgAccount {
  orgId: string;
  name: string;
  tier: "monitor" | "agency";
  ownerEmail: string;
  memberEmails: string[];
  brands: OrgBrand[];
  createdAt: string;
  // Agency tier features
  maxBrands: number;      // 5 for monitor, 25 for agency
  maxAuditsPerDay: number; // 10 for monitor, unlimited for agency
  apiKeyHash?: string;     // For programmatic access (agency only)
}

export interface OrgBrand {
  brandName: string;
  brandUrl: string;
  category: string;
  addedAt: string;
}

const ORG_TTL = 0; // No expiry for org records

/**
 * Create a new organization account.
 * Called during manual Agency onboarding.
 */
export async function createOrg(org: Omit<OrgAccount, "createdAt">): Promise<OrgAccount> {
  const redis = getRedis();
  const record: OrgAccount = {
    ...org,
    createdAt: new Date().toISOString(),
  };
  
  if (redis) {
    await redis.set(`asov:org:${org.orgId}`, JSON.stringify(record));
    // Index by owner email for lookup
    await redis.set(`asov:org_email:${org.ownerEmail.toLowerCase()}`, org.orgId);
    // Index member emails
    for (const email of org.memberEmails) {
      await redis.set(`asov:org_email:${email.toLowerCase()}`, org.orgId);
    }
  }
  
  return record;
}

/**
 * Get an org by its ID.
 */
export async function getOrg(orgId: string): Promise<OrgAccount | null> {
  const redis = getRedis();
  if (!redis) return null;
  
  try {
    const raw = await redis.get<string>(`asov:org:${orgId}`);
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

/**
 * Look up org by member email.
 */
export async function getOrgByEmail(email: string): Promise<OrgAccount | null> {
  const redis = getRedis();
  if (!redis) return null;
  
  try {
    const orgId = await redis.get<string>(`asov:org_email:${email.toLowerCase()}`);
    if (!orgId) return null;
    return getOrg(orgId);
  } catch {
    return null;
  }
}

/**
 * Add a brand to an org's portfolio.
 */
export async function addBrandToOrg(orgId: string, brand: OrgBrand): Promise<boolean> {
  const org = await getOrg(orgId);
  if (!org) return false;
  
  if (org.brands.length >= org.maxBrands) {
    return false; // Hit brand limit
  }
  
  // Check for duplicate
  if (org.brands.some(b => b.brandUrl.toLowerCase() === brand.brandUrl.toLowerCase())) {
    return false;
  }
  
  org.brands.push(brand);
  
  const redis = getRedis();
  if (redis) {
    await redis.set(`asov:org:${orgId}`, JSON.stringify(org));
  }
  return true;
}

/**
 * Validate that a request is authorized for the given tier.
 * For agency tier, checks that the email belongs to an org with an active subscription.
 */
export async function validateTierAccess(
  email: string | undefined,
  tier: string,
): Promise<{ allowed: boolean; org?: OrgAccount; reason?: string }> {
  // Snapshot is always allowed (with email gate)
  if (tier === "snapshot") return { allowed: true };
  
  if (!email) {
    return { allowed: false, reason: "Email required for paid tiers" };
  }
  
  const org = await getOrgByEmail(email);
  
  if (!org) {
    return { allowed: false, reason: `No active ${tier} subscription found for this email. Contact us to get started.` };
  }
  
  // Check tier matches
  if (tier === "agency" && org.tier !== "agency") {
    return { allowed: false, reason: "Your account is on the Monitor plan. Upgrade to Agency for this feature." };
  }
  
  return { allowed: true, org };
}

/**
 * Check if an org has remaining audit capacity for today.
 */
export async function checkOrgAuditCapacity(
  orgId: string,
): Promise<{ allowed: boolean; remaining: number }> {
  const redis = getRedis();
  const org = await getOrg(orgId);
  if (!org) return { allowed: false, remaining: 0 };
  
  // Agency tier = unlimited
  if (org.tier === "agency") return { allowed: true, remaining: 999 };
  
  if (!redis) return { allowed: true, remaining: org.maxAuditsPerDay };
  
  try {
    const today = new Date().toISOString().slice(0, 10);
    const key = `asov:org_audits:${orgId}:${today}`;
    const count = (await redis.get<number>(key)) || 0;
    const remaining = Math.max(0, org.maxAuditsPerDay - count);
    return { allowed: remaining > 0, remaining };
  } catch {
    return { allowed: true, remaining: org.maxAuditsPerDay };
  }
}

/**
 * Record an audit for org daily capacity tracking.
 */
export async function recordOrgAudit(orgId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  
  try {
    const today = new Date().toISOString().slice(0, 10);
    const key = `asov:org_audits:${orgId}:${today}`;
    await redis.incr(key);
    await redis.expire(key, 48 * 60 * 60); // 48hr cleanup
  } catch {
    // Best effort
  }
}
