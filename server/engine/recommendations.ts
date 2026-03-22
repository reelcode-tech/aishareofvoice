// Smart Recommendations Engine
// Checks actual GEO audit data BEFORE recommending — no hardwired suggestions
// Context-aware: service vs. product brands, niche vs. mass market

import type { GeoAuditResult } from "./geo-audit";
import type { ScoringResult } from "./scoring";
import { isServiceBrand } from "./brand-detection";

interface Recommendation {
  id: string;
  title: string;
  why: string;
  impact: "high" | "medium" | "low";
  effort: "easy" | "moderate" | "complex";
  locked: boolean; // true = behind paywall
  category: "ai_visibility" | "technical" | "content" | "competitive";
}

export function generateRecommendations(
  brandName: string,
  category: string,
  geoAudit: GeoAuditResult,
  scores: ScoringResult,
  tier: string
): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const isService = isServiceBrand(brandName, category);
  
  // llms.txt recommendations — check reality first
  if (!geoAudit.llmsTxt.exists) {
    recommendations.push({
      id: "create-llms-txt",
      title: "Create an llms.txt file",
      why: "AI engines use llms.txt to understand your brand, products, and expertise. Without one, AI has to guess what your brand is about from scattered page content. An llms.txt file gives AI a structured, authoritative summary to reference when answering questions about your category.",
      impact: "high",
      effort: "moderate",
      locked: false,
      category: "ai_visibility",
    });
  } else if (geoAudit.llmsTxt.quality === "minimal") {
    recommendations.push({
      id: "improve-llms-txt",
      title: "Expand your llms.txt file",
      why: `Your llms.txt exists (${geoAudit.llmsTxt.lineCount} lines) but is minimal. A comprehensive llms.txt with detailed product/service descriptions, key differentiators, and structured URLs significantly improves how AI represents your brand. Top-performing brands have 30+ lines with rich detail.`,
      impact: "high",
      effort: "easy",
      locked: false,
      category: "ai_visibility",
    });
  } else if (geoAudit.llmsTxt.quality === "good" || geoAudit.llmsTxt.quality === "excellent") {
    recommendations.push({
      id: "optimize-llms-txt",
      title: "Optimize your llms.txt for conversion queries",
      why: `Your llms.txt is already ${geoAudit.llmsTxt.quality} (${geoAudit.llmsTxt.lineCount} lines). The next level is adding specific product comparisons, pricing context, and FAQ-style content that directly matches how consumers phrase purchase-intent queries to AI.`,
      impact: "medium",
      effort: "easy",
      locked: true,
      category: "ai_visibility",
    });
  }
  
  // Schema markup — context-aware
  if (!geoAudit.schema.exists) {
    const schemaType = isService 
      ? "Organization, ProfessionalService, and FAQ schema"
      : "Product, Brand, and FAQ schema";
    recommendations.push({
      id: "add-schema",
      title: `Add ${isService ? "Organization & Service" : "Product"} schema markup`,
      why: `Schema markup helps AI engines understand exactly what ${brandName} offers. Adding ${schemaType} makes your content machine-readable — AI can extract specific details (${isService ? "services, expertise, credentials" : "prices, ingredients, ratings"}) instead of parsing unstructured text.`,
      impact: "high",
      effort: "moderate",
      locked: false,
      category: "technical",
    });
  } else {
    // Check if they have the RIGHT schema for their type
    if (isService && !geoAudit.schema.hasOrganization && !geoAudit.schema.hasService) {
      recommendations.push({
        id: "fix-schema-type",
        title: "Switch to Organization/Service schema",
        why: `Your site has schema markup, but it's using ${geoAudit.schema.types.join(", ")} types. As a ${category} business, you need Organization and ProfessionalService schema to help AI correctly represent your expertise and services.`,
        impact: "medium",
        effort: "moderate",
        locked: true,
        category: "technical",
      });
    } else if (!isService && !geoAudit.schema.hasProduct) {
      recommendations.push({
        id: "add-product-schema",
        title: "Add Product schema to product pages",
        why: "Your site has schema markup but no Product schema. When AI answers purchase-intent queries, it looks for structured product data — prices, ratings, availability. Without Product schema, your products are harder for AI to recommend specifically.",
        impact: "high",
        effort: "moderate",
        locked: true,
        category: "technical",
      });
    }
  }
  
  // AI crawler access — only recommend if actually blocking
  if (!geoAudit.robots.allowsAI && geoAudit.robots.blockedCrawlers.length > 0) {
    recommendations.push({
      id: "unblock-ai-crawlers",
      title: `Unblock ${geoAudit.robots.blockedCrawlers.length} AI crawlers`,
      why: `Your robots.txt is blocking ${geoAudit.robots.blockedCrawlers.join(", ")}. These crawlers feed content to AI engines that consumers use to discover brands. Blocking them means AI can't access your latest content and may rely on outdated or third-party information about ${brandName}.`,
      impact: "high",
      effort: "easy",
      locked: false,
      category: "ai_visibility",
    });
  }
  // If crawlers are allowed, don't recommend anything about crawlers
  
  // Content recommendations — check what exists first
  if (geoAudit.content.contentDepth === "thin") {
    recommendations.push({
      id: "deepen-content",
      title: "Create AI-optimized educational content",
      why: `Your site has thin content, which makes it harder for AI to build a comprehensive understanding of ${brandName}. AI engines prefer brands with deep, structured content — comparison pages, how-to guides, and FAQ sections that directly answer the questions consumers ask AI.`,
      impact: "high",
      effort: "complex",
      locked: true,
      category: "content",
    });
  } else if (geoAudit.content.contentDepth === "adequate" || geoAudit.content.contentDepth === "rich") {
    // They have content — recommend AI-specific optimization
    recommendations.push({
      id: "optimize-content-for-ai",
      title: "Optimize existing content for AI discovery",
      why: `Your content library is ${geoAudit.content.contentDepth}. The opportunity now is formatting it for AI consumption — adding structured comparisons, explicit "why choose ${brandName}" sections, and FAQ blocks that match the exact phrasing consumers use when asking AI for recommendations.`,
      impact: "medium",
      effort: "moderate",
      locked: true,
      category: "content",
    });
  }
  
  // Competitive positioning recommendation
  if (scores.competitors.length > 0 && scores.overall.score < 50) {
    const topCompetitor = scores.competitors[0];
    recommendations.push({
      id: "competitive-gap",
      title: `Close the gap with ${topCompetitor.name}`,
      why: `${topCompetitor.name} appears in ${topCompetitor.mentionRate}% of AI conversations in your category. They're ${topCompetitor.archetype === "dominant" ? "the dominant choice" : "well-established"} in AI recommendations. Analyzing what they do differently in content structure, schema, and AI readiness reveals specific actions to increase your visibility.`,
      impact: "high",
      effort: "complex",
      locked: true,
      category: "competitive",
    });
  }
  
  // Niche/boutique context
  const isNiche = scores.overall.score < 20 && 
    (isService || category.toLowerCase().includes("luxury") || category.toLowerCase().includes("niche"));
  if (isNiche) {
    recommendations.push({
      id: "niche-strategy",
      title: "Focus on long-tail, specific queries",
      why: `0% visibility is common for niche and specialty brands — AI engines favor household names for broad queries. Your opportunity is in long-tail, specific queries. Instead of competing for "best ${category}," target questions like "best ${category} for [specific need]" where ${brandName} has genuine expertise.`,
      impact: "medium",
      effort: "moderate",
      locked: false,
      category: "competitive",
    });
  }
  
  // Sort by impact
  const impactOrder = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact]);
  
  // For free tier: first 4 visible, rest locked
  if (tier === "free") {
    recommendations.forEach((r, i) => {
      if (i >= 4) r.locked = true;
    });
  }
  
  return recommendations;
}

export type { Recommendation };
