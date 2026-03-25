// Main audit orchestrator — coordinates all engine components
// Speed-optimized: batched parallel API calls, concurrent GEO audit
import { detectBrandFromUrl } from "./brand-detection";
import { getQueriesForBrand } from "./query-templates";
import { getEnginesForTier, queryEnginesBatch, type EngineResult } from "./ai-engines";
import { runGeoAudit, type GeoAuditResult } from "./geo-audit";
import { calculateScores, type ScoringResult } from "./scoring";
import { generateRecommendations, type Recommendation } from "./recommendations";
import type { AuditRequest } from "@shared/schema";

export interface AuditResult {
  brandName: string;
  brandUrl: string;
  category: string;
  tier: string;
  language: string;
  scores: ScoringResult;
  geoAudit: GeoAuditResult;
  recommendations: Recommendation[];
  engineResults: EngineResult[];
  customCompetitors: string[];
  timestamp: string;
}

export async function runAudit(request: AuditRequest): Promise<AuditResult> {
  const url = request.url.startsWith("http") ? request.url : `https://${request.url}`;
  
  // Step 1: Detect brand and category
  const detected = detectBrandFromUrl(url);
  const brandName = request.brandName || detected?.brand || "Unknown Brand";
  const category = request.category || detected?.category || "general";
  const tier = request.tier || "snapshot";
  const language = request.language || "en";
  
  const startTime = Date.now();
  console.log(`[Audit] Starting audit for ${brandName} (${category}) at ${url}, tier=${tier}`);
  
  // Step 2: Get queries and engines
  const queries = getQueriesForBrand(brandName, category, language, tier as any);
  const engines = getEnginesForTier(tier);
  
  console.log(`[Audit] Running ${queries.length} queries across ${engines.length} engines (${engines.map(e => e.name).join(', ')})...`);
  
  // Step 3: Run GEO audit and AI engine queries IN PARALLEL
  // The GEO audit is purely HTTP fetches — runs concurrently with AI queries
  const [geoAudit, engineResults] = await Promise.all([
    runGeoAudit(url),
    queryEnginesBatch(engines, queries, brandName, category),
  ]);
  
  const queryTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Audit] Got ${engineResults.length} engine results in ${queryTime}s, GEO audit complete`);
  
  // Step 4: Calculate scores
  const scores = calculateScores(brandName, category, engineResults, geoAudit);
  
  // Step 5: Generate context-aware recommendations
  const recommendations = generateRecommendations(
    brandName, category, geoAudit, scores, tier
  );
  
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Audit] Score: ${scores.overall.score}/100 (${scores.overall.grade}), ${recommendations.length} recommendations, total: ${totalTime}s`);
  
  return {
    brandName,
    brandUrl: url,
    category,
    tier,
    language,
    scores,
    geoAudit,
    recommendations,
    engineResults,
    customCompetitors: request.customCompetitors || [],
    timestamp: new Date().toISOString(),
  };
}
