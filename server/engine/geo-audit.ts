// GEO Technical Audit — checks site for AI discoverability signals
// Checks: llms.txt, schema markup, robots.txt, content depth, meta tags

interface GeoAuditResult {
  llmsTxt: {
    exists: boolean;
    url: string | null;
    lineCount: number;
    quality: "excellent" | "good" | "minimal" | "none";
  };
  schema: {
    exists: boolean;
    types: string[];
    hasProduct: boolean;
    hasOrganization: boolean;
    hasFAQ: boolean;
    hasService: boolean;
  };
  robots: {
    exists: boolean;
    allowsAI: boolean;
    blockedCrawlers: string[];
  };
  content: {
    hasStructuredContent: boolean;
    estimatedPages: number;
    hasBlog: boolean;
    hasFAQ: boolean;
    contentDepth: "rich" | "adequate" | "thin";
  };
  meta: {
    hasOgTags: boolean;
    hasDescription: boolean;
    titleQuality: "good" | "generic" | "missing";
  };
  overallReadiness: number; // 0-100
  tier: "ai_visibility_drivers" | "basic_hygiene";
}

async function fetchWithTimeout(url: string, timeout = 8000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ASOVBot/1.0; +https://aishareofvoice.ai)",
      },
    });
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    const text = await response.text();
    // Detect bot challenge pages
    if (text.length < 5000 && (text.includes("meta http-equiv=\"refresh\"") || text.includes("captcha"))) {
      return null;
    }
    return text;
  } catch {
    return null;
  }
}

export async function runGeoAudit(siteUrl: string): Promise<GeoAuditResult> {
  const baseUrl = siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;
  const origin = new URL(baseUrl).origin;
  
  // Check llms.txt
  const llmsTxtContent = await fetchWithTimeout(`${origin}/llms.txt`);
  const llmsTxt = {
    exists: !!llmsTxtContent,
    url: llmsTxtContent ? `${origin}/llms.txt` : null,
    lineCount: llmsTxtContent ? llmsTxtContent.split("\n").filter(l => l.trim()).length : 0,
    quality: (!llmsTxtContent ? "none" : 
      (llmsTxtContent.split("\n").filter(l => l.trim()).length > 20 ? "excellent" : 
       llmsTxtContent.split("\n").filter(l => l.trim()).length > 5 ? "good" : "minimal")
    ) as "excellent" | "good" | "minimal" | "none",
  };
  
  // Check robots.txt
  const robotsContent = await fetchWithTimeout(`${origin}/robots.txt`);
  const aiCrawlers = ["GPTBot", "ChatGPT-User", "Google-Extended", "anthropic-ai", "ClaudeBot", "CCBot", "PerplexityBot"];
  const blockedCrawlers: string[] = [];
  if (robotsContent) {
    for (const crawler of aiCrawlers) {
      const pattern = new RegExp(`User-agent:\\s*${crawler}[\\s\\S]*?Disallow:\\s*/`, "i");
      if (pattern.test(robotsContent)) {
        blockedCrawlers.push(crawler);
      }
    }
  }
  const robots = {
    exists: !!robotsContent,
    allowsAI: blockedCrawlers.length === 0,
    blockedCrawlers,
  };
  
  // Check homepage for schema markup, meta tags, content
  const homepageContent = await fetchWithTimeout(baseUrl);
  
  let schema = {
    exists: false,
    types: [] as string[],
    hasProduct: false,
    hasOrganization: false,
    hasFAQ: false,
    hasService: false,
  };
  
  let meta = {
    hasOgTags: false,
    hasDescription: false,
    titleQuality: "missing" as "good" | "generic" | "missing",
  };
  
  let content = {
    hasStructuredContent: false,
    estimatedPages: 0,
    hasBlog: false,
    hasFAQ: false,
    contentDepth: "thin" as "rich" | "adequate" | "thin",
  };
  
  if (homepageContent) {
    // Schema markup
    const schemaMatches = homepageContent.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
    if (schemaMatches.length > 0) {
      schema.exists = true;
      for (const match of schemaMatches) {
        try {
          const jsonStr = match.replace(/<script[^>]*>/, "").replace(/<\/script>/i, "");
          const data = JSON.parse(jsonStr);
          const types = Array.isArray(data) ? data.map((d: any) => d["@type"]) : [data["@type"]];
          schema.types.push(...types.filter(Boolean).map(String));
        } catch {}
      }
      schema.hasProduct = schema.types.some(t => t.toLowerCase().includes("product"));
      schema.hasOrganization = schema.types.some(t => t.toLowerCase().includes("organization"));
      schema.hasFAQ = schema.types.some(t => t.toLowerCase().includes("faq"));
      schema.hasService = schema.types.some(t => t.toLowerCase().includes("service"));
    }
    
    // Meta tags
    meta.hasOgTags = /property="og:/.test(homepageContent);
    meta.hasDescription = /name="description"/.test(homepageContent);
    const titleMatch = homepageContent.match(/<title[^>]*>(.*?)<\/title>/i);
    if (titleMatch) {
      const title = titleMatch[1].trim();
      meta.titleQuality = title.length > 10 ? "good" : title.length > 0 ? "generic" : "missing";
    }
    
    // Content signals
    const linkCount = (homepageContent.match(/<a\s/gi) || []).length;
    content.estimatedPages = Math.min(linkCount, 200);
    content.hasBlog = /blog|article|post|news/i.test(homepageContent);
    content.hasFAQ = /faq|frequently\s+asked|questions/i.test(homepageContent);
    content.hasStructuredContent = schema.exists || content.hasBlog || content.hasFAQ;
    content.contentDepth = homepageContent.length > 50000 ? "rich" : 
      homepageContent.length > 15000 ? "adequate" : "thin";
  }
  
  // Calculate overall readiness score
  let score = 0;
  // llms.txt (30 points max)
  if (llmsTxt.quality === "excellent") score += 30;
  else if (llmsTxt.quality === "good") score += 20;
  else if (llmsTxt.quality === "minimal") score += 10;
  
  // Schema (20 points max)
  if (schema.exists) score += 10;
  if (schema.hasProduct || schema.hasOrganization || schema.hasService) score += 10;
  
  // AI crawler access (20 points max)
  if (robots.exists && robots.allowsAI) score += 20;
  else if (!robots.exists) score += 15; // No robots.txt = generally open
  else if (blockedCrawlers.length < 3) score += 10;
  
  // Content depth (20 points max)
  if (content.contentDepth === "rich") score += 20;
  else if (content.contentDepth === "adequate") score += 12;
  else score += 5;
  
  // Meta/SEO basics (10 points max)
  if (meta.hasOgTags) score += 4;
  if (meta.hasDescription) score += 3;
  if (meta.titleQuality === "good") score += 3;
  
  return {
    llmsTxt,
    schema,
    robots,
    content,
    meta,
    overallReadiness: Math.min(score, 100),
    tier: "ai_visibility_drivers",
  };
}

export type { GeoAuditResult };
