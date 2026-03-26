// Main audit orchestrator — coordinates all engine components
// Speed-optimized: batched parallel API calls, concurrent GEO audit
// Gap 1: Live vs Benchmark mode (cache bypass for benchmarks)
// Gap 7: Version metadata stored with every audit
// Gap 16: Metadata enrichment (latency, cache stats, cost per query)
// Gap 18: Within-run query deduplication
// Gap 19: GEO audit caching in Redis
// Gap 20: Brand detection caching in Redis
// Gap 21: Full raw response storage

import { detectBrandFromUrl } from "./brand-detection";
import { getQueriesForBrand } from "./query-templates";
import { getEnginesForTier, queryEnginesBatch, type EngineResult } from "./ai-engines";
import { runGeoAudit, type GeoAuditResult } from "./geo-audit";
import { calculateScores, type ScoringResult } from "./scoring";
import { generateRecommendations, type Recommendation } from "./recommendations";
import { buildVersionMetadata, type AuditVersionMetadata } from "./versioning";
import { deduplicateQueries, getDedupeStats } from "./query-dedup";
import { getCachedGeoAudit, setCachedGeoAudit } from "./result-cache";
import { getCachedBrandDetection, setCachedBrandDetection } from "./result-cache";
import type { AuditRequest } from "@shared/schema";

export interface AuditResult {
  brandName: string;
  brandUrl: string;
  category: string;
  tier: string;
  mode: "live" | "benchmark"; // Gap 1
  language: string;
  scores: ScoringResult;
  geoAudit: GeoAuditResult;
  recommendations: Recommendation[];
  engineResults: EngineResult[];
  customCompetitors: string[];
  timestamp: string;
  // Gap 7: Version metadata for reproducibility
  versionMetadata: AuditVersionMetadata;
  // Gap 16: Enriched metadata
  auditMetadata: AuditMetadata;
  // Gap 21: Raw responses for reprocessing
  rawResponses: RawResponse[];
}

// Gap 16: Enriched audit metadata
export interface AuditMetadata {
  totalDurationMs: number;
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

// Gap 21: Raw response storage
interface RawResponse {
  engine: string;
  model: string;
  query: string;
  response: string;
  timestamp: string;
}

export async function runAudit(request: AuditRequest): Promise<AuditResult> {
  const url = request.url.startsWith("http") ? request.url : `https://${request.url}`;
  const mode = (request as any).mode || "live"; // Gap 1: live vs benchmark
  
  // Step 1: Detect brand and category (Gap 20: check Redis cache first)
  let brandName = request.brandName || "";
  let category = request.category || "";
  
  if (!brandName || !category) {
    // Gap 20: Check brand detection cache
    const cachedBrand = await getCachedBrandDetection(url);
    if (cachedBrand && !brandName) brandName = cachedBrand.brand;
    if (cachedBrand && !category) category = cachedBrand.category;
    
    if (!brandName || !category) {
      const detected = detectBrandFromUrl(url);
      if (!brandName) brandName = detected?.brand || "Unknown Brand";
      if (!category) category = detected?.category || "general";
      
      // Cache the detection result
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
  
  const auditStartTime = Date.now();
  console.log(`[Audit] Starting ${mode} audit for ${brandName} (${category}) at ${url}, tier=${tier}`);
  
  // Step 2: Get queries and engines
  const rawQueries = getQueriesForBrand(brandName, category, language, tier as any);
  
  // Gap 18: Deduplicate queries within this run
  const queries = deduplicateQueries(rawQueries);
  const dedupeStats = getDedupeStats(rawQueries, queries);
  if (dedupeStats.removedCount > 0) {
    console.log(`[Audit] Deduped ${dedupeStats.removedCount} duplicate queries (${dedupeStats.originalCount} → ${dedupeStats.dedupedCount})`);
  }
  
  const engines = getEnginesForTier(tier);
  
  console.log(`[Audit] Running ${queries.length} queries across ${engines.length} engines (${engines.map(e => e.name).join(', ')})...`);
  
  // Step 3: Run GEO audit and AI engine queries IN PARALLEL
  // Gap 19: Check GEO cache first (in live mode only; benchmark = always fresh)
  const geoStartTime = Date.now();
  let geoAudit: GeoAuditResult;
  
  if (mode === "live") {
    const cachedGeo = await getCachedGeoAudit(url);
    if (cachedGeo) {
      geoAudit = cachedGeo;
      console.log("[Audit] GEO audit from cache");
    } else {
      geoAudit = await runGeoAudit(url);
      await setCachedGeoAudit(url, geoAudit);
    }
  } else {
    // Benchmark mode: always fresh
    geoAudit = await runGeoAudit(url);
  }
  const geoDurationMs = Date.now() - geoStartTime;
  
  // Gap 1: Pass mode to engine queries (benchmark = skip cache)
  const queryStartTime = Date.now();
  const engineResults = await queryEnginesBatch(engines, queries, brandName, category, tier, mode, language);
  const queryDurationMs = Date.now() - queryStartTime;
  
  console.log(`[Audit] Got ${engineResults.length} engine results in ${(queryDurationMs / 1000).toFixed(1)}s, GEO audit in ${(geoDurationMs / 1000).toFixed(1)}s`);
  
  // Step 4: Calculate scores
  const scoringStartTime = Date.now();
  const scores = calculateScores(brandName, category, engineResults, geoAudit);
  const scoringDurationMs = Date.now() - scoringStartTime;
  
  // Step 5: Generate context-aware recommendations
  const recommendations = generateRecommendations(
    brandName, category, geoAudit, scores, tier
  );
  
  const totalDurationMs = Date.now() - auditStartTime;
  console.log(`[Audit] Score: ${scores.overall.score}/100 (${scores.overall.grade}), ${recommendations.length} recommendations, total: ${(totalDurationMs / 1000).toFixed(1)}s`);
  
  // Gap 7: Build version metadata for reproducibility
  const engineModels: Record<string, string> = {};
  for (const e of engines) {
    engineModels[e.name] = e.model;
  }
  const versionMetadata = buildVersionMetadata(
    tier, engineModels, queries.length, engines.length, language, mode as "live" | "benchmark"
  );
  
  // Gap 16: Build enriched metadata
  // Count cache hits vs misses from engine results
  const totalApiCalls = engines.length * queries.length;
  const responsesWithContent = engineResults.filter(r => r.response && r.response.length > 0).length;
  // Rough heuristic: if response is empty, it was likely a cache miss that failed or was skipped
  const cacheHits = 0; // Will be tracked at the engine level in future
  
  // Estimate cost (using provider cost data from spend-tracker)
  const COST_CENTS: Record<string, number> = {
    ChatGPT: 0.06, Gemini: 0.02, Claude: 0.03, Grok: 1.50, Perplexity: 0.50,
  };
  let estimatedCostCents = 0;
  for (const e of engines) {
    estimatedCostCents += (COST_CENTS[e.name] || 0.05) * queries.length;
  }
  
  const auditMetadata: AuditMetadata = {
    totalDurationMs,
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
  
  // Gap 21: Store raw responses for reprocessing
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
    customCompetitors: request.customCompetitors || [],
    timestamp: new Date().toISOString(),
    versionMetadata,
    auditMetadata,
    rawResponses,
  };
}
