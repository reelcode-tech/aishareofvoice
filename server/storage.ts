import { type Audit, type InsertAudit, type Lead, audits, leads, ipLimits } from "@shared/schema";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, desc, and, sql, gt } from "drizzle-orm";

// Connection — uses DATABASE_URL from environment
// Workers-compatible: creates connection per-request context
// The postgres driver uses HTTP/WebSocket under nodejs_compat, so connection
// creation is lightweight compared to traditional TCP sockets.
let _db: ReturnType<typeof drizzle> | null = null;
let _dbUrl: string | null = null;

export function getDb(databaseUrl?: string) {
  const url = databaseUrl || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  // Reuse connection if URL hasn't changed (same request context)
  if (_db && _dbUrl === url) return _db;
  const client = postgres(url, { 
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  _db = drizzle(client);
  _dbUrl = url;
  return _db;
}

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

// LazyStorage: same interface as DatabaseStorage but defers DB connection
// until the first actual method call. Critical for Cloudflare Workers where
// process.env isn't populated until the request middleware runs.
export class LazyStorage implements IStorage {
  private _inner: DatabaseStorage | null = null;
  
  private get inner(): DatabaseStorage {
    if (!this._inner) this._inner = new DatabaseStorage();
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
