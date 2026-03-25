// Smart Recommendations Engine
// Context-aware: checks actual GEO audit data, explains WHY, gives examples and expected impact
// Now includes full PLAYBOOK content: step-by-step instructions, copy-pasteable code, query-linked fixes

import type { GeoAuditResult } from "./geo-audit";
import type { ScoringResult } from "./scoring";
import { isServiceBrand } from "./brand-detection";

interface PlaybookStep {
  step: number;
  title: string;
  description: string;
  code?: string; // Copy-pasteable code/content
}

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
  // NEW: Full playbook with step-by-step instructions
  playbook?: PlaybookStep[];
  // NEW: Which failing queries this recommendation addresses
  linkedQueries?: string[];
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

  // Collect queries where brand was NOT mentioned (for linking recs to failing queries)
  const failingQueries = (scores as any).queryDetails
    ?.filter((q: any) => !q.mentioned)
    ?.map((q: any) => q.query)
    ?.slice(0, 5) || [];

  const purchaseQueries = failingQueries.filter((q: string) =>
    q.toLowerCase().includes("best") || q.toLowerCase().includes("top") || q.toLowerCase().includes("recommend")
  );

  const comparisonQueries = failingQueries.filter((q: string) =>
    q.toLowerCase().includes("vs") || q.toLowerCase().includes("comparison") || q.toLowerCase().includes("alternative")
  );
  
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
      playbook: [
        {
          step: 1,
          title: "Create the file",
          description: `Create a new text file called \`llms.txt\` in your website's root directory (same level as robots.txt).`,
          code: `# ${brandName}\n> ${isService ? `Leading ${category} provider known for [your key differentiator]` : `Premium ${category} brand specializing in [your focus area]`}\n\n## What we do\n${isService ? `We provide ${category} services that help [target customer] achieve [key outcome]. Our approach focuses on [unique methodology/approach].` : `We create ${category} products designed for [target customer]. Our products are known for [key differentiator — quality, innovation, sustainability, etc.].`}\n\n## Our ${isService ? "services" : "products"}\n- [${isService ? "Service" : "Product"} 1]: [One-line description with key benefit]\n- [${isService ? "Service" : "Product"} 2]: [One-line description with key benefit]\n- [${isService ? "Service" : "Product"} 3]: [One-line description with key benefit]\n\n## Why choose ${brandName}\n- [Differentiator 1: e.g., "10+ years of expertise in..."]\n- [Differentiator 2: e.g., "Used by 50,000+ customers..."]\n- [Differentiator 3: e.g., "Only brand that offers..."]\n\n## ${brandName} vs alternatives\n- Best for: [specific use case where you win]\n- Price range: [your positioning]\n- What sets us apart: [1-2 sentences]\n\n## FAQ\nQ: Is ${brandName} good for [common question]?\nA: [Direct, honest answer with specifics]\n\nQ: How does ${brandName} compare to [top competitor]?\nA: [Honest comparison highlighting your strengths]`,
        },
        {
          step: 2,
          title: "Deploy to your site root",
          description: `Upload the file so it's accessible at \`${brandName.toLowerCase().replace(/\s+/g, "")}.com/llms.txt\`. Most hosting platforms let you put files in the public/root folder.`,
        },
        {
          step: 3,
          title: "Verify it works",
          description: `Open your browser and go to your-domain.com/llms.txt — you should see the raw text content. Then re-run this audit in 2-4 weeks to measure the impact.`,
        },
      ],
      linkedQueries: purchaseQueries.length > 0 ? purchaseQueries : failingQueries.slice(0, 3),
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
      playbook: [
        {
          step: 1,
          title: "Add competitive positioning",
          description: `Add a comparison section to your existing llms.txt that directly addresses how ${brandName} compares to alternatives. AI engines use this when answering "vs" and "alternative" queries.`,
          code: `## ${brandName} vs alternatives\n- Best for: [your ideal customer/use case]\n- Price range: [your positioning — budget, mid-range, premium]\n- What sets us apart: [1-2 specific differentiators]\n\n## vs [Top Competitor Name]\n- Where ${brandName} wins: [specific advantage]\n- Where they win: [be honest — this builds credibility]\n- Best choice when: [specific scenario]`,
        },
        {
          step: 2,
          title: "Add FAQ answers",
          description: `Add 3-5 frequently asked questions with direct answers. These map directly to the kinds of queries AI gets asked.`,
          code: `## FAQ\nQ: Is ${brandName} worth it?\nA: [Honest answer with specific value proposition]\n\nQ: What is ${brandName} best for?\nA: [Specific use case and customer type]\n\nQ: How much does ${brandName} cost?\nA: [Price range or pricing model]`,
        },
        {
          step: 3,
          title: "Verify length and re-test",
          description: `Your llms.txt should now be 30+ lines. Re-run this audit in 2-3 weeks to measure the impact on mention rate.`,
        },
      ],
      linkedQueries: comparisonQueries.length > 0 ? comparisonQueries : failingQueries.slice(0, 3),
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
      playbook: [
        {
          step: 1,
          title: "Add purchase-intent sections",
          description: `Add content that matches how people ask AI for buying decisions — "best for X", pricing, and direct recommendations.`,
          code: `## Best for\n- ${brandName} is ideal for: [specific customer profile]\n- Not ideal for: [who should look elsewhere — builds trust]\n\n## Pricing\n- [Plan/Product 1]: $XX — best for [use case]\n- [Plan/Product 2]: $XX — best for [use case]`,
        },
      ],
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
      playbook: [
        {
          step: 1,
          title: "Choose the right schema type",
          description: isService
            ? `As a ${category} business, use Organization and ProfessionalService schema. This tells AI you provide services, not products.`
            : `As a ${category} brand, use Product and Brand schema. Add this to every product page.`,
        },
        {
          step: 2,
          title: "Add the schema to your pages",
          description: `Paste this code into the <head> section of your ${isService ? "homepage" : "product pages"}. Replace the placeholder values with your actual data.`,
          code: isService
            ? `<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "ProfessionalService",\n  "name": "${brandName}",\n  "description": "[Your one-line description]",\n  "url": "[Your website URL]",\n  "areaServed": "[City/Region/Country]",\n  "serviceType": "${category}",\n  "provider": {\n    "@type": "Organization",\n    "name": "${brandName}",\n    "foundingDate": "[Year]",\n    "numberOfEmployees": "[Range like 50-200]"\n  },\n  "hasOfferCatalog": {\n    "@type": "OfferCatalog",\n    "name": "Services",\n    "itemListElement": [\n      {\n        "@type": "Offer",\n        "itemOffered": {\n          "@type": "Service",\n          "name": "[Service Name]",\n          "description": "[What it does]"\n        }\n      }\n    ]\n  }\n}\n</script>`
            : `<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "Product",\n  "name": "[Product Name]",\n  "brand": {\n    "@type": "Brand",\n    "name": "${brandName}"\n  },\n  "description": "[Product description]",\n  "offers": {\n    "@type": "Offer",\n    "price": "[Price]",\n    "priceCurrency": "USD",\n    "availability": "https://schema.org/InStock"\n  },\n  "aggregateRating": {\n    "@type": "AggregateRating",\n    "ratingValue": "[e.g. 4.5]",\n    "reviewCount": "[e.g. 1200]"\n  }\n}\n</script>`,
        },
        {
          step: 3,
          title: "Validate your schema",
          description: `Go to https://validator.schema.org and paste your page URL to confirm the schema is detected correctly. Fix any errors before moving on.`,
        },
      ],
      linkedQueries: purchaseQueries.slice(0, 3),
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
        playbook: [
          {
            step: 1,
            title: "Replace your current schema",
            description: `Change your existing schema from ${geoAudit.schema.types.join("/")} to ProfessionalService. Keep the same placement in your HTML.`,
            code: `<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "ProfessionalService",\n  "name": "${brandName}",\n  "serviceType": "${category}"\n}\n</script>`,
          },
        ],
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
        playbook: [
          {
            step: 1,
            title: "Add Product schema to each product page",
            description: `Add structured data with pricing, ratings, and availability for each product.`,
            code: `<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "Product",\n  "name": "[Product Name]",\n  "brand": { "@type": "Brand", "name": "${brandName}" },\n  "offers": { "@type": "Offer", "price": "[Price]", "priceCurrency": "USD" },\n  "aggregateRating": { "@type": "AggregateRating", "ratingValue": "[4.5]", "reviewCount": "[1200]" }\n}\n</script>`,
          },
        ],
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
      playbook: [
        {
          step: 1,
          title: "Open your robots.txt file",
          description: `Find the robots.txt file in your website root. You can see it at your-domain.com/robots.txt.`,
        },
        {
          step: 2,
          title: "Remove the AI crawler blocks",
          description: `Find and remove (or change to Allow) these lines that are blocking AI crawlers:`,
          code: geoAudit.robots.blockedCrawlers.map(c => 
            `# REMOVE these lines:\nUser-agent: ${c}\nDisallow: /\n\n# REPLACE with:\nUser-agent: ${c}\nAllow: /`
          ).join("\n\n"),
        },
        {
          step: 3,
          title: "Verify the change",
          description: `Visit your-domain.com/robots.txt and confirm the AI crawler blocks are removed. Changes take effect immediately — AI crawlers will re-index your site within days.`,
        },
      ],
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
      playbook: [
        {
          step: 1,
          title: "Create a comparison page",
          description: `Write a detailed "${brandName} vs [Top Competitor]" page that honestly compares features, pricing, and use cases. AI loves structured comparison content.`,
        },
        {
          step: 2,
          title: "Build a buyer's guide",
          description: `Create a "How to choose the right ${category}" guide with ${brandName} positioned naturally within it. Use H2/H3 headers that match common AI queries.`,
        },
        {
          step: 3,
          title: "Add FAQ content",
          description: `Add an FAQ section answering questions like "Is ${brandName} worth it?" and "What's the best ${category} for [use case]?". Direct answers in the first sentence help AI extract and cite your content.`,
        },
      ],
      linkedQueries: failingQueries.slice(0, 5),
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
      playbook: [
        {
          step: 1,
          title: "Add direct-answer headers",
          description: `On your key pages, add H2 headers that match common AI queries. Start each section with a direct 1-2 sentence answer before expanding.`,
          code: `<!-- Example restructured section -->\n<h2>Is ${brandName} worth it?</h2>\n<p><strong>Yes, ${brandName} is worth it for [specific customer type].</strong> Here's why: [2-3 specific reasons]. However, if you need [X], consider [alternative] instead.</p>`,
        },
        {
          step: 2,
          title: "Add comparison tables",
          description: `Create structured comparison tables on product pages. AI engines extract tabular data more reliably than prose.`,
        },
      ],
      linkedQueries: failingQueries.slice(0, 3),
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
      playbook: [
        {
          step: 1,
          title: `Check ${topCompetitor.name}'s AI readiness`,
          description: `Visit ${topCompetitor.name.toLowerCase().replace(/\s+/g, "")}.com/llms.txt to see if they have one. Check their robots.txt for AI crawler access. View page source for schema markup.`,
        },
        {
          step: 2,
          title: "Audit their content structure",
          description: `Look at their product pages, blog, and FAQ sections. Note how they structure content — direct answers, comparison tables, structured data. These are the patterns AI engines prefer.`,
        },
        {
          step: 3,
          title: "Close the gap",
          description: `Apply the same structural patterns to your site. You don't need to copy their content — just match (and exceed) their AI readiness: llms.txt quality, schema depth, and content structure.`,
        },
      ],
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
      playbook: [
        {
          step: 1,
          title: "Identify your winning queries",
          description: `Look at the queries above where you DID get mentioned. These reveal what AI already knows you're good at. Double down on content around these topics.`,
        },
        {
          step: 2,
          title: "Create niche content",
          description: `Build pages targeting long-tail queries where you have a genuine advantage: "${brandName} for [specific audience]", "best ${category} for [specific use case]".`,
        },
        {
          step: 3,
          title: "Update llms.txt for niche positioning",
          description: `In your llms.txt, be specific about who you serve best. Generic positioning gets drowned out; specific positioning wins niche queries.`,
        },
      ],
      linkedQueries: failingQueries,
    });
  }
  
  // Sort: high impact first, then medium, then low
  const impactOrder = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact]);
  
  // Snapshot tier: only llms.txt recommendation visible, everything else locked with teaser copy
  const normalizedTier = tier === "free" ? "snapshot" : tier === "pro" ? "monitor" : tier === "enterprise" ? "agency" : tier;
  if (normalizedTier === "snapshot") {
    recommendations.forEach((r) => {
      // Only the llms.txt recommendation is unlocked
      const isLlmsTxt = r.id === "llms-txt" || r.title.toLowerCase().includes("llms.txt");
      if (!isLlmsTxt) {
        r.locked = true;
      }
    });
  }
  
  return recommendations;
}

export type { Recommendation, PlaybookStep };
