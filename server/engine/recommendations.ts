// Smart Recommendations Engine
// Context-aware: checks actual GEO audit data, explains WHY, gives examples and expected impact

import type { GeoAuditResult } from "./geo-audit";
import type { ScoringResult } from "./scoring";
import { isServiceBrand } from "./brand-detection";

interface Recommendation {
  id: string;
  title: string;
  why: string;
  example?: string;
  expectedImpact?: string;
  impact: "high" | "medium" | "low";
  effort: "easy" | "moderate" | "complex";
  locked: boolean;
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
  
  // llms.txt — the #1 thing most brands are missing
  if (!geoAudit.llmsTxt.exists) {
    recommendations.push({
      id: "create-llms-txt",
      title: "Create an llms.txt file",
      why: `Right now, AI has to guess what ${brandName} does by reading your site. An llms.txt file tells AI engines directly — your products, what makes you different, who you're for. It's like giving AI a cheat sheet about your brand.`,
      example: `# ${brandName}\n> ${isService ? "Leading " + category + " provider" : "Premium " + category + " brand"}\n\n## What We Do\n${isService ? "We help companies with..." : "We make " + category + " products that..."}\n\n## Why Choose Us\n- [Key differentiator 1]\n- [Key differentiator 2]\n\n## Products / Services\n- [Product 1]: [one-line description]\n- [Product 2]: [one-line description]`,
      expectedImpact: "Brands that add llms.txt typically see 15-30% more AI mentions within 2-4 weeks as engines re-index.",
      impact: "high",
      effort: "moderate",
      locked: false,
      category: "ai_visibility",
    });
  } else if (geoAudit.llmsTxt.quality === "minimal") {
    recommendations.push({
      id: "improve-llms-txt",
      title: "Expand your llms.txt — it's too thin",
      why: `You have an llms.txt (${geoAudit.llmsTxt.lineCount} lines), but it's not giving AI enough to work with. Top brands have 30+ lines with specific product details, comparisons, and use cases. More detail means AI can recommend you for more specific queries.`,
      example: `Add sections like:\n\n## vs [Top Competitor]\n- Where ${brandName} wins: [specific advantage]\n- Best for: [specific use case]\n\n## FAQ\nQ: Is ${brandName} good for [common question]?\nA: [Direct answer with specifics]`,
      expectedImpact: "Expanding from minimal to detailed llms.txt can double your mention rate on specific queries.",
      impact: "high",
      effort: "easy",
      locked: false,
      category: "ai_visibility",
    });
  } else if (geoAudit.llmsTxt.quality === "good" || geoAudit.llmsTxt.quality === "excellent") {
    recommendations.push({
      id: "optimize-llms-txt",
      title: "Add purchase-intent content to your llms.txt",
      why: `Your llms.txt is solid (${geoAudit.llmsTxt.lineCount} lines). The next move is adding content that matches how people actually ask AI for buying advice — price comparisons, "best for X" positioning, and direct answers to purchase questions.`,
      expectedImpact: "Fine-tuning for purchase intent can shift you from appearing in research queries to appearing in buying decisions.",
      impact: "medium",
      effort: "easy",
      locked: true,
      category: "ai_visibility",
    });
  }
  
  // Schema markup
  if (!geoAudit.schema.exists) {
    const schemaType = isService 
      ? "Organization and Service" 
      : "Product and Brand";
    recommendations.push({
      id: "add-schema",
      title: `Add ${schemaType} schema markup`,
      why: `Without schema, AI reads your site like a human skimming a page. With it, AI can instantly pull ${isService ? "your services, expertise, and credentials" : "prices, ratings, ingredients, and specs"}. Think of schema as the difference between AI guessing and AI knowing.`,
      example: isService 
        ? `<script type="application/ld+json">{\n  "@type": "ProfessionalService",\n  "name": "${brandName}",\n  "description": "...",\n  "areaServed": "...",\n  "hasOfferCatalog": {...}\n}</script>`
        : `<script type="application/ld+json">{\n  "@type": "Product",\n  "name": "[Product Name]",\n  "brand": "${brandName}",\n  "offers": { "price": "..." },\n  "aggregateRating": {...}\n}</script>`,
      expectedImpact: "Schema markup helps AI extract specific details. Brands with rich schema see 20-40% more detailed mentions.",
      impact: "high",
      effort: "moderate",
      locked: false,
      category: "technical",
    });
  } else {
    if (isService && !geoAudit.schema.hasOrganization && !geoAudit.schema.hasService) {
      recommendations.push({
        id: "fix-schema-type",
        title: "Switch to the right schema type for your business",
        why: `You have schema, but it's ${geoAudit.schema.types.join(", ")} — which tells AI you're a product brand. As a ${category} business, you need Organization and ProfessionalService schema so AI correctly represents your expertise.`,
        expectedImpact: "Correcting schema type helps AI categorize you correctly, reducing irrelevant query matches.",
        impact: "medium",
        effort: "moderate",
        locked: true,
        category: "technical",
      });
    } else if (!isService && !geoAudit.schema.hasProduct) {
      recommendations.push({
        id: "add-product-schema",
        title: "Add Product schema to your product pages",
        why: `You have schema, but no Product markup. When someone asks AI "what's the best ${category}?", AI looks for structured product data — prices, ratings, availability. Without it, your products are harder to recommend with specific details.`,
        expectedImpact: "Product schema lets AI cite specific prices and ratings, making recommendations more concrete and actionable.",
        impact: "high",
        effort: "moderate",
        locked: true,
        category: "technical",
      });
    }
  }
  
  // AI crawler access
  if (!geoAudit.robots.allowsAI && geoAudit.robots.blockedCrawlers.length > 0) {
    recommendations.push({
      id: "unblock-ai-crawlers",
      title: `Unblock ${geoAudit.robots.blockedCrawlers.length} AI crawlers in robots.txt`,
      why: `Your robots.txt is actively blocking ${geoAudit.robots.blockedCrawlers.join(", ")}. These crawlers feed the AI engines your customers are using. When they can't access your site, AI relies on outdated or third-party info about ${brandName}.`,
      example: `Remove or modify these lines in robots.txt:\n\n# Before (blocking AI)\nUser-agent: GPTBot\nDisallow: /\n\n# After (allowing AI)\nUser-agent: GPTBot\nAllow: /`,
      expectedImpact: "This is the fastest fix — unblocking crawlers lets AI re-index your content within days.",
      impact: "high",
      effort: "easy",
      locked: false,
      category: "ai_visibility",
    });
  }
  
  // Content depth
  if (geoAudit.content.contentDepth === "thin") {
    recommendations.push({
      id: "deepen-content",
      title: "Build content AI can actually recommend",
      why: `AI needs substance to recommend you. Right now your site is thin on the kind of content AI pulls from — comparison pages, how-to guides, FAQ sections. Without it, AI has nothing to cite when someone asks about ${category}.`,
      example: `Create pages like:\n- "${brandName} vs [Competitor]: Which is better for [use case]?"\n- "How to choose the right ${category} (2026 guide)"\n- FAQ: "Is ${brandName} worth it?" with honest, detailed answers`,
      expectedImpact: "Brands that build comparison and guide content see the biggest jumps — often going from 0% to 10-20% visibility.",
      impact: "high",
      effort: "complex",
      locked: true,
      category: "content",
    });
  } else if (geoAudit.content.contentDepth === "adequate" || geoAudit.content.contentDepth === "rich") {
    recommendations.push({
      id: "optimize-content-for-ai",
      title: "Restructure your content for AI consumption",
      why: `Your content library is ${geoAudit.content.contentDepth}. The gap isn't volume — it's format. AI prefers direct answers, structured comparisons, and explicit "why choose us" sections over long-form narratives.`,
      example: `Restructure existing content to add:\n- Clear H2/H3 headers that match AI queries ("Best ${category} for...")\n- Direct answer paragraphs in the first 100 words\n- Comparison tables with specific data points\n- "Why ${brandName}" sections on product pages`,
      expectedImpact: "Restructuring existing content is high-ROI — you're not creating new pages, just making existing ones AI-readable.",
      impact: "medium",
      effort: "moderate",
      locked: true,
      category: "content",
    });
  }
  
  // Competitive positioning
  if (scores.competitors.length > 0 && scores.overall.score < 50) {
    const topCompetitor = scores.competitors[0];
    recommendations.push({
      id: "competitive-gap",
      title: `Study what ${topCompetitor.name} is doing differently`,
      why: `${topCompetitor.name} shows up in ${topCompetitor.mentionRate}% of AI conversations in your category. They're not necessarily a better brand — they're just more visible to AI. Understanding their content structure, schema, and AI readiness reveals exactly where to focus.`,
      expectedImpact: "Closing the gap with the top competitor is usually a 3-6 month effort, but each fix compounds.",
      impact: "high",
      effort: "complex",
      locked: true,
      category: "competitive",
    });
  }
  
  // Niche brand strategy
  const isNiche = scores.overall.score < 20 && 
    (isService || category.toLowerCase().includes("luxury") || category.toLowerCase().includes("niche"));
  if (isNiche) {
    recommendations.push({
      id: "niche-strategy",
      title: "Own your niche — stop competing on broad queries",
      why: `Low visibility is normal for specialty brands. AI defaults to household names for "best ${category}" queries. Your opportunity is in specific queries where you genuinely excel — "best ${category} for [your specific angle]" where ${brandName} has a real edge.`,
      example: `Instead of optimizing for "best ${category}", target:\n- "best ${category} for [your specific audience]"\n- "${category} with [your unique feature]"\n- "[specific problem] ${category} solution"`,
      expectedImpact: "Niche brands that optimize for specific queries often dominate those results even if broad visibility stays low.",
      impact: "medium",
      effort: "moderate",
      locked: false,
      category: "competitive",
    });
  }
  
  // Sort: high impact first, then medium, then low
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
