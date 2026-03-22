import { type Audit, type InsertAudit, audits } from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, and } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

export interface IStorage {
  createAudit(audit: InsertAudit): Promise<Audit>;
  getAudit(id: number): Promise<Audit | undefined>;
  getAuditsByBrand(brandName: string): Promise<Audit[]>;
  getRecentAudits(limit?: number): Promise<Audit[]>;
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
}

export const storage = new DatabaseStorage();
