// Main audit orchestrator — coordinates all engine components
// Dynamic query generation: one cheap LLM call produces tailored queries per brand
// Competitors flow through the entire pipeline: query gen → AI queries → scoring

import { detectBrandFromUrl } from "./brand-detection";
import { generateQueries } from "./query-generator";
import { getEnginesForTier, queryEnginesBatch, type EngineResult } from "./ai-engines";
import { runGeoAudit, type GeoAuditResult } from "./geo-audit";
import { calculateScores, type ScoringResult } from "./scoring";
import { generateRecommendations, type Recommendation } from "./recommendations";
import { buildVersionMetadata, type AuditVersionMetadata } from "./versioning";
import { deduplicateQueries, getDedupeStats } from "./query-dedup";
import { getCachedGeoAudit, setCachedGeoAudit } from "./result-cache";
import { getCachedBrandDetection, setCachedBrandDetection } from "./result-cache";
import { logger } from "./logger";
import type { AuditRequest } from "@shared/schema";

export interface AuditResult {
  brandName: string;
  brandUrl: string;
  category: string;
  tier: string;
  mode: "live" | "benchmark";
  language: string;
  scores: ScoringResult;
  geoAudit: GeoAuditResult;
  recommendations: Recommendation[];
  engineResults: EngineResult[];
  customCompetitors: string[];
  generatedQueries: { query: string; intent: string }[]; // The actual queries that were run
  timestamp: string;
  versionMetadata: AuditVersionMetadata;
  auditMetadata: AuditMetadata;
  rawResponses: RawResponse[];
}

export interface AuditMetadata {
  totalDurationMs: number;
  queryGenDurationMs: number;
  queryDurationMs: number;
  geoDurationMs: number;
  scoringDurationMs: number;
  queryCount: number;
  queryCountBeforeDedup: number;
  queryCountAfterDedup: number;
  engineCount: number;
  totalApiCalls: number;
  cacheHits: number;
  cacheMisses: number;
  estimatedCostCents: number;
}

interface RawResponse {
  engine: string;
  model: string;
  query: string;
  response: string;
  timestamp: string;
}

export async function runAudit(request: AuditRequest): Promise<AuditResult> {
  const url = request.url.startsWith("http") ? request.url : `https://${request.url}`;
  const mode = (request as any).mode || "live";
  
  // Step 1: Detect brand and category
  let brandName = request.brandName || "";
  let category = request.category || "";
  
  if (!brandName || !category) {
    const cachedBrand = await getCachedBrandDetection(url);
    if (cachedBrand && !brandName) brandName = cachedBrand.brand;
    if (cachedBrand && !category) category = cachedBrand.category;
    
    if (!brandName || !category) {
      const detected = detectBrandFromUrl(url);
      if (!brandName) brandName = detected?.brand || "Unknown Brand";
      if (!category) category = detected?.category || "general";
      
      if (detected?.brand) {
        await setCachedBrandDetection(url, {
          brand: detected.brand,
          category: detected.category || "general",
          confidence: "high",
        });
      }
    }
  }
  
  const tier = request.tier || "snapshot";
  const language = request.language || "en";
  const customCompetitors = request.customCompetitors || [];
  
  const auditStartTime = Date.now();
  logger.info("audit_start", {
    brand: brandName, category, url, tier, mode,
    competitors: customCompetitors.length,
  });
  
  // Step 2: Generate tailored queries using LLM
  // This is the key change: queries are dynamically generated per brand/category/competitors
  // Cost: ~$0.02 (one Gemini Flash call)
  const queryGenStartTime = Date.now();
  const rawQueries = await generateQueries(
    brandName,
    category,
    customCompetitors,
    tier as "snapshot" | "monitor" | "agency",
    language,
  );
  const queryGenDurationMs = Date.now() - queryGenStartTime;
  
  // Deduplicate within this run
  const queries = deduplicateQueries(rawQueries);
  const dedupeStats = getDedupeStats(rawQueries, queries);
  if (dedupeStats.removedCount > 0) {
    logger.info("query_dedup", {
      original: dedupeStats.originalCount,
      deduped: dedupeStats.dedupedCount,
      removed: dedupeStats.removedCount,
    });
  }
  
  const engines = getEnginesForTier(tier);
  
  logger.info("audit_queries_ready", {
    queryCount: queries.length,
    engineCount: engines.length,
    engines: engines.map(e => e.name).join(", "),
    queryGenMs: queryGenDurationMs,
  });
  
  // Step 3: Run GEO audit and AI engine queries IN PARALLEL
  const geoStartTime = Date.now();
  let geoAudit: GeoAuditResult;
  
  if (mode === "live") {
    const cachedGeo = await getCachedGeoAudit(url);
    if (cachedGeo) {
      geoAudit = cachedGeo;
      logger.info("geo_cache_hit", { url });
    } else {
      geoAudit = await runGeoAudit(url);
      await setCachedGeoAudit(url, geoAudit);
    }
  } else {
    geoAudit = await runGeoAudit(url);
  }
  const geoDurationMs = Date.now() - geoStartTime;
  
  const queryStartTime = Date.now();
  const engineResults = await queryEnginesBatch(engines, queries, brandName, category, tier, mode, language);
  const queryDurationMs = Date.now() - queryStartTime;
  
  logger.info("audit_queries_complete", {
    resultCount: engineResults.length,
    queryMs: queryDurationMs,
    geoMs: geoDurationMs,
  });
  
  // Step 4: Calculate scores — pass customCompetitors so they're included in competitive analysis
  const scoringStartTime = Date.now();
  const scores = calculateScores(brandName, category, engineResults, geoAudit, customCompetitors);
  const scoringDurationMs = Date.now() - scoringStartTime;
  
  // Step 5: Generate context-aware recommendations
  const recommendations = generateRecommendations(
    brandName, category, geoAudit, scores, tier
  );
  
  const totalDurationMs = Date.now() - auditStartTime;
  logger.info("audit_complete", {
    brand: brandName,
    score: scores.overall.score,
    grade: scores.overall.grade,
    recommendations: recommendations.length,
    totalMs: totalDurationMs,
  });
  
  // Build version metadata
  const engineModels: Record<string, string> = {};
  for (const e of engines) {
    engineModels[e.name] = e.model;
  }
  const versionMetadata = buildVersionMetadata(
    tier, engineModels, queries.length, engines.length, language, mode as "live" | "benchmark"
  );
  
  // Build enriched metadata
  const totalApiCalls = engines.length * queries.length;
  const cacheHits = 0;
  
  const COST_CENTS: Record<string, number> = {
    ChatGPT: 0.06, Gemini: 0.02, Claude: 0.03, Grok: 1.50, Perplexity: 0.50,
  };
  let estimatedCostCents = 0.02; // Query generation cost (Gemini Flash)
  for (const e of engines) {
    estimatedCostCents += (COST_CENTS[e.name] || 0.05) * queries.length;
  }
  
  const auditMetadata: AuditMetadata = {
    totalDurationMs,
    queryGenDurationMs,
    queryDurationMs,
    geoDurationMs,
    scoringDurationMs,
    queryCount: queries.length,
    queryCountBeforeDedup: dedupeStats.originalCount,
    queryCountAfterDedup: dedupeStats.dedupedCount,
    engineCount: engines.length,
    totalApiCalls,
    cacheHits,
    cacheMisses: totalApiCalls - cacheHits,
    estimatedCostCents: Math.round(estimatedCostCents * 100) / 100,
  };
  
  // Store raw responses for reprocessing
  const rawResponses: RawResponse[] = engineResults.map(r => ({
    engine: r.engine,
    model: r.model,
    query: r.query,
    response: r.response,
    timestamp: r.timestamp,
  }));
  
  return {
    brandName,
    brandUrl: url,
    category,
    tier,
    mode: mode as "live" | "benchmark",
    language,
    scores,
    geoAudit,
    recommendations,
    engineResults,
    customCompetitors,
    generatedQueries: queries,
    timestamp: new Date().toISOString(),
    versionMetadata,
    auditMetadata,
    rawResponses,
  };
}
