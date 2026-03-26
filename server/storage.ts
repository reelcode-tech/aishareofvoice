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
    try {
      const [result] = await this.db.insert(audits).values(audit).returning();
      return result;
    } catch (error: any) {
      // Log the actual Postgres error details
      console.error("[Storage] Insert error code:", error.code, "severity:", error.severity, "detail:", error.detail);
      console.error("[Storage] Insert error message (first 300):", error.message?.slice(0, 300));
      
      // Fallback: try raw SQL insert with only the core fields
      console.log("[Storage] Attempting raw SQL fallback insert...");
      try {
        const freshDb = createDb();
        const db = drizzle(freshDb as any);
        // Strip the optional JSONB fields and try again
        const { generatedQueries, rawResponses, versionMetadata, auditMetadata, ...essential } = audit as any;
        const [result] = await db.insert(audits).values(essential).returning();
        console.log("[Storage] Fallback insert succeeded, id:", result?.id);
        return result;
      } catch (fallbackError: any) {
        console.error("[Storage] Fallback error code:", fallbackError.code, "message:", fallbackError.message?.slice(0, 300));
        
        // Last resort: try raw SQL with minimal fields
        try {
          console.log("[Storage] Attempting raw SQL minimal insert...");
          const rawClient = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false, idle_timeout: 0, connect_timeout: 10 });
          const result = await rawClient`
            INSERT INTO audits (brand_name, brand_url, category, tier, mode, language, overall_score, overall_grade, 
              confidence_low, confidence_high, margin_of_error, observations,
              engine_results, competitors, query_results, sentiment_data, citation_data,
              geo_audit, recommendations, custom_competitors)
            VALUES (
              ${audit.brandName}, ${audit.brandUrl}, ${audit.category}, ${audit.tier}, 
              ${(audit as any).mode || 'live'}, ${audit.language || 'en'}, 
              ${audit.overallScore ?? null}, ${audit.overallGrade ?? null},
              ${audit.confidenceLow ?? null}, ${audit.confidenceHigh ?? null}, 
              ${audit.marginOfError ?? null}, ${audit.observations ?? null},
              ${JSON.stringify(audit.engineResults) ?? null}::jsonb,
              ${JSON.stringify(audit.competitors) ?? null}::jsonb,
              ${JSON.stringify(audit.queryResults) ?? null}::jsonb,
              ${JSON.stringify(audit.sentimentData) ?? null}::jsonb,
              ${JSON.stringify(audit.citationData) ?? null}::jsonb,
              ${JSON.stringify(audit.geoAudit) ?? null}::jsonb,
              ${JSON.stringify(audit.recommendations) ?? null}::jsonb,
              ${JSON.stringify(audit.customCompetitors) ?? null}::jsonb
            )
            RETURNING *
          `;
          await rawClient.end();
          console.log("[Storage] Raw SQL insert succeeded, id:", result[0]?.id);
          return result[0] as unknown as Audit;
        } catch (rawError: any) {
          console.error("[Storage] Raw SQL insert also failed:", rawError.message?.slice(0, 300));
          throw rawError;
        }
      }
    }
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
    const windowStartMs = Date.now() - windowMinutes * 60 * 1000;
    const windowStartISO = new Date(windowStartMs).toISOString();
    
    // Clean old entries using raw SQL timestamp to avoid Date serialization issues
    await this.db.execute(
      sql`DELETE FROM ip_limits WHERE window_start < ${windowStartISO}::timestamp`
    );
    
    // Count in current window
    const records = await this.db.select().from(ipLimits)
      .where(and(
        eq(ipLimits.ipAddress, ip),
        sql`${ipLimits.windowStart} > ${windowStartISO}::timestamp`
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
