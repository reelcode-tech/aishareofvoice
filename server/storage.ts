import { type Audit, type InsertAudit, type Lead, audits, leads, ipLimits } from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, and, sql } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

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
  async createAudit(audit: InsertAudit): Promise<Audit> {
    return db.insert(audits).values(audit).returning().get();
  }

  async getAudit(id: number): Promise<Audit | undefined> {
    return db.select().from(audits).where(eq(audits.id, id)).get();
  }

  async getAuditsByBrand(brandName: string): Promise<Audit[]> {
    return db.select().from(audits)
      .where(eq(audits.brandName, brandName))
      .orderBy(desc(audits.createdAt))
      .all();
  }

  async getRecentAudits(limit: number = 20): Promise<Audit[]> {
    return db.select().from(audits)
      .orderBy(desc(audits.createdAt))
      .limit(limit)
      .all();
  }

  // ── Lead management ────────────────────────────────────
  async getOrCreateLead(email: string): Promise<Lead> {
    const existing = await this.getLeadByEmail(email);
    if (existing) return existing;
    return db.insert(leads).values({
      email: email.toLowerCase().trim(),
      auditCount: 0,
      createdAt: new Date().toISOString(),
    }).returning().get();
  }

  async getLeadByEmail(email: string): Promise<Lead | undefined> {
    return db.select().from(leads)
      .where(eq(leads.email, email.toLowerCase().trim()))
      .get();
  }

  async incrementLeadAuditCount(email: string): Promise<Lead> {
    const now = new Date().toISOString();
    const lead = await this.getOrCreateLead(email);
    return db.update(leads)
      .set({
        auditCount: lead.auditCount + 1,
        lastAuditAt: now,
        firstAuditAt: lead.firstAuditAt || now,
      })
      .where(eq(leads.email, email.toLowerCase().trim()))
      .returning()
      .get();
  }

  // ── IP rate limiting ───────────────────────────────────
  async checkIpLimit(ip: string, maxPerWindow: number = 3, windowMinutes: number = 60): Promise<{ allowed: boolean; remaining: number }> {
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
    // Clean old entries
    db.delete(ipLimits).where(
      sql`${ipLimits.windowStart} < ${windowStart}`
    ).run();
    // Count in current window
    const records = db.select().from(ipLimits)
      .where(and(
        eq(ipLimits.ipAddress, ip),
        sql`${ipLimits.windowStart} >= ${windowStart}`
      ))
      .all();
    const totalCount = records.reduce((sum, r) => sum + r.auditCount, 0);
    return {
      allowed: totalCount < maxPerWindow,
      remaining: Math.max(0, maxPerWindow - totalCount),
    };
  }

  async incrementIpCount(ip: string): Promise<void> {
    const now = new Date().toISOString();
    // Upsert: try to find existing row for this IP in current window, or create new
    const existing = db.select().from(ipLimits)
      .where(eq(ipLimits.ipAddress, ip))
      .orderBy(desc(ipLimits.windowStart))
      .limit(1)
      .get();
    if (existing) {
      db.update(ipLimits)
        .set({ auditCount: existing.auditCount + 1 })
        .where(eq(ipLimits.id, existing.id))
        .run();
    } else {
      db.insert(ipLimits).values({
        ipAddress: ip,
        auditCount: 1,
        windowStart: now,
      }).run();
    }
  }
}

export const storage = new DatabaseStorage();
