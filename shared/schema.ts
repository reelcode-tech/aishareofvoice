import { pgTable, text, integer, serial, doublePrecision, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Email leads — gating the free tier
export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  auditCount: integer("audit_count").notNull().default(0),
  firstAuditAt: timestamp("first_audit_at"),
  lastAuditAt: timestamp("last_audit_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// IP rate limiting — prevent abuse without email
export const ipLimits = pgTable("ip_limits", {
  id: serial("id").primaryKey(),
  ipAddress: text("ip_address").notNull(),
  auditCount: integer("audit_count").notNull().default(0),
  windowStart: timestamp("window_start").notNull().defaultNow(),
});

export type Lead = typeof leads.$inferSelect;

// Audit results stored for historical tracking
export const audits = pgTable("audits", {
  id: serial("id").primaryKey(),
  brandName: text("brand_name").notNull(),
  brandUrl: text("brand_url").notNull(),
  category: text("category").notNull(),
  tier: text("tier").notNull().default("snapshot"), // snapshot | monitor | agency
  mode: text("mode").notNull().default("live"), // live | benchmark (Gap 1)
  language: text("language").notNull().default("en"),
  overallScore: integer("overall_score"), // 0-100
  overallGrade: text("overall_grade"),
  confidenceLow: doublePrecision("confidence_low"),
  confidenceHigh: doublePrecision("confidence_high"),
  marginOfError: text("margin_of_error"),
  observations: integer("observations"),
  // JSONB columns for complex data (Postgres native JSON)
  engineResults: jsonb("engine_results"), // per-engine scores
  competitors: jsonb("competitors"), // competitor visibility data
  queryResults: jsonb("query_results"), // per-query results with AI responses
  sentimentData: jsonb("sentiment_data"), // sentiment breakdown
  citationData: jsonb("citation_data"), // source/citation tracking
  geoAudit: jsonb("geo_audit"), // technical audit (llms.txt, schema, crawlers, etc.)
  recommendations: jsonb("recommendations"), // actionable recommendations
  customCompetitors: jsonb("custom_competitors"), // user-defined competitor set
  rawResponses: jsonb("raw_responses"), // Gap 21: full raw AI responses for reprocessing
  versionMetadata: jsonb("version_metadata"), // Gap 7: scoring/extraction versions for reproducibility
  auditMetadata: jsonb("audit_metadata"), // Gap 16: enriched metadata (latency, cache stats, cost)
  generatedQueries: jsonb("generated_queries"), // Dynamic LLM-generated queries that were actually run
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAuditSchema = createInsertSchema(audits).omit({
  id: true,
});

export type InsertAudit = z.infer<typeof insertAuditSchema>;
export type Audit = typeof audits.$inferSelect;

// Request schema for running an audit (Gap 22: mode + locale + competitorSet validation)
export const auditRequestSchema = z.object({
  url: z.string().url().or(z.string().min(3)),
  brandName: z.string().optional(),
  category: z.string().optional(),
  tier: z.enum(["snapshot", "monitor", "agency"]).default("snapshot"),
  mode: z.enum(["live", "benchmark", "test"]).default("live"), // Gap 1: live vs benchmark mode; "test" = mock responses, no API calls
  email: z.string().email().optional(),
  language: z.string().min(2).max(10).default("en"), // Gap 22: tighter locale validation
  customCompetitors: z
    .array(z.string().min(1).max(100))
    .max(20) // Gap 22: cap at 20 competitors
    .optional(),
});

export type AuditRequest = z.infer<typeof auditRequestSchema>;
