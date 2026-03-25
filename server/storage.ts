import { type Audit, type InsertAudit, type Lead, audits, leads, ipLimits } from "@shared/schema";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, desc, and, sql, gt } from "drizzle-orm";

// Connection — uses DATABASE_URL from environment
// Workers-compatible: creates a fresh connection per request context.
// The postgres driver needs special config for Workers:
// - max: 1 (no pooling — Workers isolates are per-request)
// - prepare: false (Workers don't support prepared statements across requests)
// - idle_timeout: 0 (close immediately when done)

function createDb(databaseUrl?: string) {
  const url = databaseUrl || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const client = postgres(url, { 
    max: 1,
    idle_timeout: 0,
    connect_timeout: 10,
    prepare: false,  // Critical for Workers — no prepared statement caching
  });
  return drizzle(client);
}

// Get a fresh DB connection — in Workers, each request should get its own
// to avoid stale connection issues across isolate re-invocations
function getDb(databaseUrl?: string) {
  return createDb(databaseUrl);
}

export { getDb };

export interface IStorage {
  createAudit(audit: InsertAudit): Promise<Audit>;
  getAudit(id: number): Promise<Audit | undefined>;
  getAuditsByBrand(brandName: string): Promise<Audit[]>;
  getRecentAudits(limit?: number): Promise<Audit[]>;
  // Lead management
  getOrCreateLead(email: string): Promise<Lead>;
  incrementLeadAuditCount(email: string): Promise<Lead>;
  getLeadByEmail(email: string): Promise<Lead | undefined>;
  // IP rate limiting
  checkIpLimit(ip: string, maxPerWindow: number, windowMinutes: number): Promise<{ allowed: boolean; remaining: number }>;
  incrementIpCount(ip: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  private db: ReturnType<typeof drizzle>;

  constructor(databaseUrl?: string) {
    this.db = getDb(databaseUrl);
  }

  async createAudit(audit: InsertAudit): Promise<Audit> {
    const [result] = await this.db.insert(audits).values(audit).returning();
    return result;
  }

  async getAudit(id: number): Promise<Audit | undefined> {
    const [result] = await this.db.select().from(audits).where(eq(audits.id, id)).limit(1);
    return result;
  }

  async getAuditsByBrand(brandName: string): Promise<Audit[]> {
    return this.db.select().from(audits)
      .where(eq(audits.brandName, brandName))
      .orderBy(desc(audits.createdAt));
  }

  async getRecentAudits(limit: number = 20): Promise<Audit[]> {
    return this.db.select().from(audits)
      .orderBy(desc(audits.createdAt))
      .limit(limit);
  }

  // ── Lead management ────────────────────────────────────
  async getOrCreateLead(email: string): Promise<Lead> {
    const existing = await this.getLeadByEmail(email);
    if (existing) return existing;
    const [result] = await this.db.insert(leads).values({
      email: email.toLowerCase().trim(),
      auditCount: 0,
    }).returning();
    return result;
  }

  async getLeadByEmail(email: string): Promise<Lead | undefined> {
    const [result] = await this.db.select().from(leads)
      .where(eq(leads.email, email.toLowerCase().trim()))
      .limit(1);
    return result;
  }

  async incrementLeadAuditCount(email: string): Promise<Lead> {
    const now = new Date();
    const lead = await this.getOrCreateLead(email);
    const [result] = await this.db.update(leads)
      .set({
        auditCount: lead.auditCount + 1,
        lastAuditAt: now,
        firstAuditAt: lead.firstAuditAt || now,
      })
      .where(eq(leads.email, email.toLowerCase().trim()))
      .returning();
    return result;
  }

  // ── IP rate limiting ───────────────────────────────────
  async checkIpLimit(ip: string, maxPerWindow: number = 3, windowMinutes: number = 60): Promise<{ allowed: boolean; remaining: number }> {
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
    
    // Clean old entries
    await this.db.delete(ipLimits).where(
      sql`${ipLimits.windowStart} < ${windowStart}`
    );
    
    // Count in current window
    const records = await this.db.select().from(ipLimits)
      .where(and(
        eq(ipLimits.ipAddress, ip),
        gt(ipLimits.windowStart, windowStart)
      ));
    
    const totalCount = records.reduce((sum, r) => sum + r.auditCount, 0);
    return {
      allowed: totalCount < maxPerWindow,
      remaining: Math.max(0, maxPerWindow - totalCount),
    };
  }

  async incrementIpCount(ip: string): Promise<void> {
    const [existing] = await this.db.select().from(ipLimits)
      .where(eq(ipLimits.ipAddress, ip))
      .orderBy(desc(ipLimits.windowStart))
      .limit(1);
    
    if (existing) {
      await this.db.update(ipLimits)
        .set({ auditCount: existing.auditCount + 1 })
        .where(eq(ipLimits.id, existing.id));
    } else {
      await this.db.insert(ipLimits).values({
        ipAddress: ip,
        auditCount: 1,
      });
    }
  }
}

// Lazy singleton for backward compatibility (don't instantiate at module load)
// In Workers, process.env isn't set until the request handler runs
let _storage: DatabaseStorage | null = null;
export function getStorage(): DatabaseStorage {
  if (!_storage) _storage = new DatabaseStorage();
  return _storage;
}

// LazyStorage: same interface as DatabaseStorage but creates a FRESH DB connection
// on every first-method-call. Critical for Cloudflare Workers where:
// 1. process.env isn't populated until the request middleware runs
// 2. TCP connections from postgres driver can go stale across isolate re-invocations
export class LazyStorage implements IStorage {
  private _inner: DatabaseStorage | null = null;
  
  private get inner(): DatabaseStorage {
    // Always create fresh — Workers isolates may reuse stale connections otherwise
    this._inner = new DatabaseStorage();
    return this._inner;
  }
  
  createAudit(audit: InsertAudit) { return this.inner.createAudit(audit); }
  getAudit(id: number) { return this.inner.getAudit(id); }
  getAuditsByBrand(brandName: string) { return this.inner.getAuditsByBrand(brandName); }
  getRecentAudits(limit?: number) { return this.inner.getRecentAudits(limit); }
  getOrCreateLead(email: string) { return this.inner.getOrCreateLead(email); }
  incrementLeadAuditCount(email: string) { return this.inner.incrementLeadAuditCount(email); }
  getLeadByEmail(email: string) { return this.inner.getLeadByEmail(email); }
  checkIpLimit(ip: string, maxPerWindow: number, windowMinutes: number) { return this.inner.checkIpLimit(ip, maxPerWindow, windowMinutes); }
  incrementIpCount(ip: string) { return this.inner.incrementIpCount(ip); }
}
