import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Audit results stored for historical tracking
export const audits = sqliteTable("audits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  brandName: text("brand_name").notNull(),
  brandUrl: text("brand_url").notNull(),
  category: text("category").notNull(),
  tier: text("tier").notNull().default("free"), // free | pro | business | enterprise
  language: text("language").notNull().default("en"),
  overallScore: integer("overall_score"), // 0-100
  overallGrade: text("overall_grade"),
  confidenceLow: real("confidence_low"),
  confidenceHigh: real("confidence_high"),
  marginOfError: text("margin_of_error"),
  observations: integer("observations"),
  // JSON text columns for complex data
  engineResults: text("engine_results"), // JSON: per-engine scores
  competitors: text("competitors"), // JSON: competitor visibility data
  queryResults: text("query_results"), // JSON: per-query results with AI responses
  sentimentData: text("sentiment_data"), // JSON: sentiment breakdown
  citationData: text("citation_data"), // JSON: source/citation tracking
  geoAudit: text("geo_audit"), // JSON: technical audit (llms.txt, schema, crawlers, etc.)
  recommendations: text("recommendations"), // JSON: actionable recommendations
  customCompetitors: text("custom_competitors"), // JSON: user-defined competitor set
  createdAt: text("created_at").notNull(),
});

export const insertAuditSchema = createInsertSchema(audits).omit({
  id: true,
});

export type InsertAudit = z.infer<typeof insertAuditSchema>;
export type Audit = typeof audits.$inferSelect;

// Request schema for running an audit
export const auditRequestSchema = z.object({
  url: z.string().url().or(z.string().min(3)),
  brandName: z.string().optional(),
  category: z.string().optional(),
  tier: z.enum(["free", "pro", "business", "enterprise"]).default("free"),
  language: z.string().default("en"),
  customCompetitors: z.array(z.string()).optional(),
});

export type AuditRequest = z.infer<typeof auditRequestSchema>;
