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

// Classify a citation URL by source type
function classifySource(url: string): string {
  const domain = url.toLowerCase();
  if (domain.includes("reddit.com")) return "reddit";
  if (domain.includes("youtube.com") || domain.includes("youtu.be")) return "video";
  if (domain.includes("amazon.com") || domain.includes("walmart.com") || domain.includes("target.com") || domain.includes("bestbuy.com") || domain.includes("etsy.com") || domain.includes("ebay.com")) return "marketplace";
  if (domain.includes("byrdie.com") || domain.includes("allure.com") || domain.includes("vogue.com") || domain.includes("nytimes.com") || domain.includes("wirecutter.com") || domain.includes("forbes.com") || domain.includes("techcrunch.com") || domain.includes("verge.com") || domain.includes("cnet.com") || domain.includes("pcmag.com") || domain.includes("wired.com") || domain.includes("gq.com") || domain.includes("elle.com") || domain.includes("cosmopolitan.com") || domain.includes("glamour.com") || domain.includes("self.com") || domain.includes("healthline.com") || domain.includes("webmd.com") || domain.includes("g2.com") || domain.includes("capterra.com") || domain.includes("trustpilot.com") || domain.includes("sleepfoundation.org")) return "editorial";
  if (domain.includes("blog") || domain.includes("review")) return "editorial";
  return "brand_site";
}

// Determine brand position in AI response (first mention, listed, or not present)
function getBrandPosition(response: string, brand: string): string {
  const lower = response.toLowerCase();
  const brandLower = brand.toLowerCase();
  if (!lower.includes(brandLower)) return "not_found";
  
  // Check if brand appears in first 200 chars (top of response)
  const firstChunk = lower.slice(0, 200);
  if (firstChunk.includes(brandLower)) return "top_pick";
  
  // Check if in first half
  const halfWay = Math.floor(lower.length / 2);
  const firstHalf = lower.slice(0, halfWay);
  if (firstHalf.includes(brandLower)) return "featured";
  
  return "mentioned";
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
  perEngine: Record<string, { score: number; mentionRate: number; totalQueries: number; byIntent: Record<string, { mentioned: number; total: number }> }>;
  queryDetails: {
    query: string;
    intent: string;
    results: {
      engine: string;
      mentionsBrand: boolean;
      brandPosition: string;
      mentionedBrands: string[];
      sentiment: string;
      responseSnippet: string;
      citations: string[];
      sourceTypes: string[];
    }[];
  }[];
  intentBreakdown: Record<string, { mentioned: number; total: number; rate: number }>;
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
  geoAudit: GeoAuditResult,
  customCompetitors: string[] = [],
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
  
  // Per-engine breakdown with intent-level analysis
  const perEngine: Record<string, { score: number; mentionRate: number; totalQueries: number; byIntent: Record<string, { mentioned: number; total: number }> }> = {};
  const engineGroups = new Map<string, EngineResult[]>();
  for (const result of engineResults) {
    const existing = engineGroups.get(result.engine) || [];
    existing.push(result);
    engineGroups.set(result.engine, existing);
  }
  for (const [engine, results] of engineGroups) {
    const mentions = results.filter(r => r.mentionsBrand).length;
    const rate = results.length > 0 ? Math.round((mentions / results.length) * 1000) / 10 : 0;
    
    // Build per-intent breakdown for this engine
    const byIntent: Record<string, { mentioned: number; total: number }> = {};
    for (const r of results) {
      // Map query to intent by looking it up in queryGroups
      let intent = "recommendation";
      for (const [q, qResults] of queryGroups) {
        if (qResults.includes(r)) {
          // Use the query text to infer intent
          const ql = q.toLowerCase();
          if (ql.includes(" vs ") || ql.includes("comparison") || ql.includes("compare")) intent = "comparison";
          else if (ql.includes("best ") || ql.includes("top ")) intent = "best";
          else if (ql.includes("review") || ql.includes("worth it")) intent = "review";
          else if (ql.includes("alternative")) intent = "alternative";
          else if (ql.includes(brandName.toLowerCase())) intent = "branded";
          break;
        }
      }
      if (!byIntent[intent]) byIntent[intent] = { mentioned: 0, total: 0 };
      byIntent[intent].total++;
      if (r.mentionsBrand) byIntent[intent].mentioned++;
    }
    
    perEngine[engine] = {
      score: rate,
      mentionRate: rate,
      totalQueries: results.length,
      byIntent,
    };
  }
  
  // Competitor extraction and ranking
  // 1. Extract ALL brands mentioned by AI engines
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
  let filteredCompetitors = filterCategoryRelevantCompetitors(rawCompetitors, category, brandName);
  
  // 2. If user provided custom competitors, ensure they appear in the list.
  //    This is critical: the user's specified competitors are the ones they CARE about.
  //    If AI didn't mention them, that's data too (the competitor has 0% mention rate).
  if (customCompetitors.length > 0) {
    const existingNames = new Set(filteredCompetitors.map(c => c.name.toLowerCase()));
    for (const custom of customCompetitors) {
      const normalized = normalizeBrandName(custom) || custom;
      if (normalized.toLowerCase() === brandName.toLowerCase()) continue;
      if (!existingNames.has(normalized.toLowerCase())) {
        // Competitor wasn't mentioned by AI at all — still include with 0 rate
        filteredCompetitors.push({
          name: normalized,
          mentionCount: 0,
          totalQueries: uniqueQueries,
          mentionRate: 0,
          archetype: "invisible",
        });
        existingNames.add(normalized.toLowerCase());
      }
    }
    
    // Prioritize custom competitors: sort so user-specified ones float to top (by mention rate)
    // but don't reorder within the AI-discovered set
    const customSet = new Set(customCompetitors.map(c => (normalizeBrandName(c) || c).toLowerCase()));
    filteredCompetitors.sort((a, b) => {
      const aIsCustom = customSet.has(a.name.toLowerCase()) ? 1 : 0;
      const bIsCustom = customSet.has(b.name.toLowerCase()) ? 1 : 0;
      // Both custom or both not: sort by mention rate
      if (aIsCustom === bIsCustom) return b.mentionRate - a.mentionRate;
      // Custom competitors go first
      return bIsCustom - aIsCustom;
    });
  }
  
  const competitors = filteredCompetitors.slice(0, 15); // Allow more with custom
  
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
  
  // Query details with enhanced data for the results page
  const queryDetails = Array.from(queryGroups.entries()).map(([query, results]) => {
    // Infer intent from query text
    const ql = query.toLowerCase();
    let intent = "recommendation";
    if (ql.includes(" vs ") || ql.includes("comparison") || ql.includes("compare")) intent = "comparison";
    else if (ql.includes("best ") || ql.includes("top ")) intent = "best";
    else if (ql.includes("review") || ql.includes("worth it")) intent = "review";
    else if (ql.includes("alternative")) intent = "alternative";
    else if (ql.includes(brandName.toLowerCase())) intent = "branded";
    
    return {
      query,
      intent,
      results: results.map(r => ({
        engine: r.engine,
        mentionsBrand: r.mentionsBrand,
        brandPosition: getBrandPosition(r.response, brandName),
        mentionedBrands: r.mentionedBrands.map(b => normalizeBrandName(b) || b),
        sentiment: r.sentiment,
        responseSnippet: r.response.slice(0, 500),
        citations: r.citations,
        sourceTypes: r.citations.map(c => classifySource(c)),
      })),
    };
  });
  
  // Build intent-level breakdown across all engines
  const intentBreakdown: Record<string, { mentioned: number; total: number; rate: number }> = {};
  for (const qd of queryDetails) {
    if (!intentBreakdown[qd.intent]) intentBreakdown[qd.intent] = { mentioned: 0, total: 0, rate: 0 };
    for (const r of qd.results) {
      intentBreakdown[qd.intent].total++;
      if (r.mentionsBrand) intentBreakdown[qd.intent].mentioned++;
    }
  }
  // Calculate rates
  for (const intent of Object.keys(intentBreakdown)) {
    const ib = intentBreakdown[intent];
    ib.rate = ib.total > 0 ? Math.round((ib.mentioned / ib.total) * 100) : 0;
  }
  
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
    intentBreakdown,
  };
}

export type { ScoringResult, CompetitorData };
