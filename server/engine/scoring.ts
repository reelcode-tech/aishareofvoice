// ASOV Scoring Engine
// 4-dimensional scoring with Wilson confidence intervals
// Dimensions: AI Visibility (35%), Technical Readiness (25%), Content Authority (25%), Competitive Position (15%)

import type { EngineResult } from "./ai-engines";
import type { GeoAuditResult } from "./geo-audit";
import { normalizeBrandName, isServiceBrand } from "./brand-detection";

// Cross-category brands that appear in AI responses regardless of category
// These are mega-brands that get mentioned everywhere as examples/comparisons
const CROSS_CATEGORY_NOISE: Record<string, string[]> = {
  skincare: ["Apple", "Nike", "Samsung", "Google", "Amazon", "Microsoft", "Tesla", "Sony", "Casper", "Purple", "Saatva", "HubSpot", "Salesforce", "Slack", "Notion", "Monday.com", "Dyson"],
  beauty: ["Apple", "Nike", "Samsung", "Google", "Amazon", "Microsoft", "Tesla", "Sony", "Casper", "Purple", "Saatva", "HubSpot", "Salesforce", "Slack", "Notion", "Monday.com", "Dyson"],
  mattresses: ["Apple", "Nike", "Samsung", "Google", "Amazon", "Microsoft", "Tesla", "Sony", "CeraVe", "The Ordinary", "Glossier", "HubSpot", "Salesforce", "Slack", "Notion", "Monday.com", "Sephora"],
  jewelry: ["Apple", "Nike", "Samsung", "Google", "Amazon", "Microsoft", "Tesla", "Sony", "Casper", "HubSpot", "Salesforce", "CeraVe", "Dyson"],
  fashion: ["Apple", "Samsung", "Google", "Amazon", "Microsoft", "Tesla", "Sony", "Casper", "HubSpot", "Salesforce", "CeraVe", "Dyson"],
  electronics: ["CeraVe", "The Ordinary", "Glossier", "Casper", "Purple", "Saatva", "HubSpot", "Salesforce", "Sephora", "Tiffany & Co.", "Mejuri", "Zara"],
  "CRM software": ["Apple", "Nike", "Samsung", "Google", "Tesla", "Sony", "CeraVe", "Casper", "Sephora", "Tiffany & Co.", "Zara", "Glossier"],
  "project management": ["Apple", "Nike", "Samsung", "Google", "Tesla", "Sony", "CeraVe", "Casper", "Sephora", "Tiffany & Co.", "Zara", "Glossier"],
  consulting: ["Apple", "Nike", "Samsung", "Google", "Tesla", "Sony", "CeraVe", "Casper", "Sephora", "Glossier", "Zara"],
  "home appliances": ["CeraVe", "The Ordinary", "Glossier", "Casper", "Purple", "Saatva", "HubSpot", "Salesforce", "Sephora", "Tiffany & Co.", "Mejuri", "Zara", "Nike"],
  "personal care": ["Apple", "Samsung", "Google", "Microsoft", "Tesla", "Sony", "Casper", "Purple", "Saatva", "HubSpot", "Salesforce", "Slack", "Notion"],
  ecommerce: ["CeraVe", "The Ordinary", "Casper", "Purple", "Saatva", "Tiffany & Co.", "Mejuri"],
  productivity: ["Apple", "Nike", "Samsung", "Tesla", "Sony", "CeraVe", "Casper", "Sephora", "Tiffany & Co.", "Zara", "Glossier"],
};

// Generic mega-brands that show up everywhere — filter if they're not in the same industry
const UNIVERSAL_MEGABRANDS = new Set([
  "Apple", "Google", "Amazon", "Microsoft", "Samsung", "Nike", "Tesla", "Sony",
  "Meta", "Facebook", "Netflix", "Spotify", "Uber", "Airbnb",
]);

/**
 * Filter competitors to only include brands relevant to the given category.
 * Removes cross-category noise (e.g., Apple showing up in skincare results).
 */
function filterCategoryRelevantCompetitors(
  competitors: CompetitorData[],
  category: string,
  brandName: string
): CompetitorData[] {
  const normalizedCategory = category.toLowerCase();
  
  // Build the noise list for this category
  let noiseSet = new Set<string>();
  
  // Check for exact or fuzzy category match in CROSS_CATEGORY_NOISE
  for (const [cat, noiseBrands] of Object.entries(CROSS_CATEGORY_NOISE)) {
    if (normalizedCategory.includes(cat.toLowerCase()) || cat.toLowerCase().includes(normalizedCategory)) {
      noiseSet = new Set(noiseBrands.map(b => b.toLowerCase()));
      break;
    }
  }
  
  // If no specific noise list found, use universal megabrands as fallback
  // (if the category doesn't match tech/electronics)
  if (noiseSet.size === 0) {
    const isTechCategory = ["tech", "electronics", "software", "computer", "phone", "device"].some(
      k => normalizedCategory.includes(k)
    );
    if (!isTechCategory) {
      noiseSet = new Set([...UNIVERSAL_MEGABRANDS].map(b => b.toLowerCase()));
    }
  }
  
  return competitors.filter(c => {
    const lowerName = c.name.toLowerCase();
    // Never filter out the brand itself
    if (lowerName === brandName.toLowerCase()) return true;
    // Filter out noise brands
    return !noiseSet.has(lowerName);
  });
}

interface CompetitorData {
  name: string;
  mentionRate: number;
  mentionCount: number;
  totalQueries: number;
  archetype: "dominant" | "established" | "consistent" | "emerging" | "invisible";
}

interface ScoringResult {
  overall: {
    score: number;
    grade: string;
    confidenceLow: number;
    confidenceHigh: number;
    marginOfError: number;
    observations: number;
  };
  dimensions: {
    aiVisibility: { score: number; grade: string; weight: number };
    technicalReadiness: { score: number; grade: string; weight: number };
    contentAuthority: { score: number; grade: string; weight: number };
    competitivePosition: { score: number; grade: string; weight: number };
  };
  competitors: CompetitorData[];
  sentimentBreakdown: {
    positive: number;
    neutral: number;
    negative: number;
    notMentioned: number;
  };
  perEngine: Record<string, { score: number; mentionRate: number; totalQueries: number }>;
  queryDetails: {
    query: string;
    intent: string;
    results: {
      engine: string;
      mentionsBrand: boolean;
      mentionedBrands: string[];
      sentiment: string;
      responseSnippet: string;
      citations: string[];
    }[];
  }[];
}

// Wilson score interval for confidence bounds
function wilsonInterval(successes: number, total: number, z: number = 1.96): {
  center: number;
  low: number;
  high: number;
  margin: number;
} {
  if (total === 0) return { center: 0, low: 0, high: 0, margin: 0 };
  
  const p = successes / total;
  const denominator = 1 + z * z / total;
  const center = (p + z * z / (2 * total)) / denominator;
  const spread = z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total) / denominator;
  
  return {
    center: Math.round(center * 1000) / 10, // percentage with 1 decimal
    low: Math.round(Math.max(0, center - spread) * 1000) / 10,
    high: Math.round(Math.min(1, center + spread) * 1000) / 10,
    margin: Math.round(spread * 1000) / 10,
  };
}

function getGrade(score: number): string {
  if (score >= 80) return "Strong";
  if (score >= 60) return "Good";
  if (score >= 40) return "Moderate";
  if (score >= 20) return "Needs Work";
  return "Critical";
}

function getArchetype(mentionRate: number): CompetitorData["archetype"] {
  if (mentionRate >= 70) return "dominant";
  if (mentionRate >= 50) return "established";
  if (mentionRate >= 30) return "consistent";
  if (mentionRate > 0) return "emerging";
  return "invisible";
}

export function calculateScores(
  brandName: string,
  category: string,
  engineResults: EngineResult[],
  geoAudit: GeoAuditResult
): ScoringResult {
  // Group results by query
  const queryGroups = new Map<string, EngineResult[]>();
  for (const result of engineResults) {
    const existing = queryGroups.get(result.query) || [];
    existing.push(result);
    queryGroups.set(result.query, existing);
  }
  
  // Calculate AI Visibility score
  const totalQueries = engineResults.length;
  const brandMentions = engineResults.filter(r => r.mentionsBrand).length;
  const wilsonResult = wilsonInterval(brandMentions, totalQueries);
  const aiVisibilityScore = wilsonResult.center;
  
  // Per-engine breakdown
  const perEngine: Record<string, { score: number; mentionRate: number; totalQueries: number }> = {};
  const engineGroups = new Map<string, EngineResult[]>();
  for (const result of engineResults) {
    const existing = engineGroups.get(result.engine) || [];
    existing.push(result);
    engineGroups.set(result.engine, existing);
  }
  for (const [engine, results] of engineGroups) {
    const mentions = results.filter(r => r.mentionsBrand).length;
    const rate = results.length > 0 ? Math.round((mentions / results.length) * 1000) / 10 : 0;
    perEngine[engine] = {
      score: rate,
      mentionRate: rate,
      totalQueries: results.length,
    };
  }
  
  // Competitor extraction and ranking
  const competitorMentions = new Map<string, number>();
  for (const result of engineResults) {
    for (const rawBrand of result.mentionedBrands) {
      const normalized = normalizeBrandName(rawBrand);
      if (normalized && normalized.toLowerCase() !== brandName.toLowerCase()) {
        competitorMentions.set(normalized, (competitorMentions.get(normalized) || 0) + 1);
      }
    }
  }
  
  const uniqueQueries = queryGroups.size;
  const rawCompetitors: CompetitorData[] = Array.from(competitorMentions.entries())
    .map(([name, count]) => ({
      name,
      mentionCount: count,
      totalQueries: uniqueQueries,
      mentionRate: Math.round((count / Math.max(totalQueries, 1)) * 1000) / 10,
      archetype: getArchetype(Math.round((count / Math.max(totalQueries, 1)) * 100)),
    }))
    .sort((a, b) => b.mentionRate - a.mentionRate);
  
  // Filter out cross-category noise (e.g., Apple in skincare, Nike in mattresses)
  const competitors = filterCategoryRelevantCompetitors(rawCompetitors, category, brandName)
    .slice(0, 10);
  
  // Sentiment breakdown
  const sentimentBreakdown = {
    positive: engineResults.filter(r => r.sentiment === "positive").length,
    neutral: engineResults.filter(r => r.sentiment === "neutral").length,
    negative: engineResults.filter(r => r.sentiment === "negative").length,
    notMentioned: engineResults.filter(r => r.sentiment === "not_mentioned").length,
  };
  
  // Technical readiness from GEO audit
  const technicalScore = geoAudit.overallReadiness;
  
  // Content authority (derived from content depth + structure)
  let contentScore = 0;
  if (geoAudit.content.contentDepth === "rich") contentScore += 40;
  else if (geoAudit.content.contentDepth === "adequate") contentScore += 25;
  else contentScore += 10;
  if (geoAudit.content.hasBlog) contentScore += 20;
  if (geoAudit.content.hasFAQ) contentScore += 15;
  if (geoAudit.schema.exists) contentScore += 15;
  if (geoAudit.llmsTxt.exists) contentScore += 10;
  contentScore = Math.min(contentScore, 100);
  
  // Competitive position
  const topCompetitorRate = competitors.length > 0 ? competitors[0].mentionRate : 0;
  const competitiveGap = topCompetitorRate - aiVisibilityScore;
  const competitiveScore = Math.max(0, Math.min(100, 100 - competitiveGap));
  
  // Weighted overall
  const overall = Math.round(
    aiVisibilityScore * 0.35 +
    technicalScore * 0.25 +
    contentScore * 0.25 +
    competitiveScore * 0.15
  );
  
  // Query details for the conversation cards
  const queryDetails = Array.from(queryGroups.entries()).map(([query, results]) => ({
    query,
    intent: "recommendation", // Will be matched from templates
    results: results.map(r => ({
      engine: r.engine,
      mentionsBrand: r.mentionsBrand,
      mentionedBrands: r.mentionedBrands.map(b => normalizeBrandName(b) || b),
      sentiment: r.sentiment,
      responseSnippet: r.response.slice(0, 500),
      citations: r.citations,
    })),
  }));
  
  return {
    overall: {
      score: overall,
      grade: getGrade(overall),
      confidenceLow: wilsonResult.low,
      confidenceHigh: wilsonResult.high,
      marginOfError: wilsonResult.margin,
      observations: totalQueries,
    },
    dimensions: {
      aiVisibility: { score: Math.round(aiVisibilityScore), grade: getGrade(aiVisibilityScore), weight: 35 },
      technicalReadiness: { score: technicalScore, grade: getGrade(technicalScore), weight: 25 },
      contentAuthority: { score: contentScore, grade: getGrade(contentScore), weight: 25 },
      competitivePosition: { score: Math.round(competitiveScore), grade: getGrade(competitiveScore), weight: 15 },
    },
    competitors,
    sentimentBreakdown,
    perEngine,
    queryDetails,
  };
}

export type { ScoringResult, CompetitorData };
