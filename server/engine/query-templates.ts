// Category-specific query templates for AI engine queries
// Uses {brand} and {category} placeholders

interface QueryTemplate {
  query: string;
  intent: "purchase" | "comparison" | "recommendation" | "research" | "alternative";
}

const CATEGORY_QUERIES: Record<string, QueryTemplate[]> = {
  skincare: [
    { query: "best {category} products 2026", intent: "recommendation" },
    { query: "best moisturizer for sensitive skin", intent: "purchase" },
    { query: "best retinol serum under $50", intent: "purchase" },
    { query: "cruelty-free face cream with hyaluronic acid", intent: "purchase" },
    { query: "skincare routine for dry skin beginners", intent: "research" },
    { query: "what is the best anti-aging serum", intent: "purchase" },
    { query: "{brand} vs competitors which is better", intent: "comparison" },
    { query: "affordable clean beauty brands", intent: "recommendation" },
    { query: "best vitamin C serum dermatologist recommended", intent: "purchase" },
    { query: "top rated sunscreen for daily wear", intent: "purchase" },
    { query: "is {brand} worth it 2026", intent: "research" },
    { query: "alternatives to {brand}", intent: "alternative" },
  ],
  mattresses: [
    { query: "best mattress 2026", intent: "recommendation" },
    { query: "best mattress for back pain", intent: "purchase" },
    { query: "luxury mattress brands worth the price", intent: "recommendation" },
    { query: "best memory foam mattress under $1500", intent: "purchase" },
    { query: "{brand} mattress review", intent: "research" },
    { query: "best hybrid mattress for side sleepers", intent: "purchase" },
    { query: "{brand} vs competitors comparison", intent: "comparison" },
    { query: "mattress brands with best warranty", intent: "research" },
    { query: "is {brand} worth it 2026", intent: "research" },
    { query: "alternatives to {brand} mattress", intent: "alternative" },
    { query: "best organic mattress brands", intent: "recommendation" },
    { query: "cooling mattress for hot sleepers", intent: "purchase" },
  ],
  "CRM software": [
    { query: "best CRM software 2026", intent: "recommendation" },
    { query: "best CRM for small business", intent: "purchase" },
    { query: "{brand} vs competitors", intent: "comparison" },
    { query: "top CRM platforms comparison", intent: "comparison" },
    { query: "is {brand} worth it", intent: "research" },
    { query: "best free CRM tools", intent: "recommendation" },
    { query: "CRM software with best automation", intent: "purchase" },
    { query: "alternatives to {brand}", intent: "alternative" },
    { query: "best CRM for sales teams", intent: "purchase" },
    { query: "easiest CRM to use 2026", intent: "recommendation" },
    { query: "CRM with best email integration", intent: "purchase" },
    { query: "enterprise CRM comparison", intent: "comparison" },
  ],
  jewelry: [
    { query: "best jewelry brands 2026", intent: "recommendation" },
    { query: "affordable fine jewelry brands", intent: "recommendation" },
    { query: "best gold jewelry under $200", intent: "purchase" },
    { query: "{brand} jewelry review", intent: "research" },
    { query: "is {brand} jewelry worth it", intent: "research" },
    { query: "alternatives to {brand}", intent: "alternative" },
    { query: "best everyday jewelry brands", intent: "recommendation" },
    { query: "top rated earrings brands", intent: "recommendation" },
    { query: "sustainable jewelry brands", intent: "recommendation" },
    { query: "luxury jewelry brands comparison", intent: "comparison" },
    { query: "best jewelry gifts for women", intent: "purchase" },
    { query: "trending jewelry brands 2026", intent: "recommendation" },
  ],
  fashion: [
    { query: "best {category} brands 2026", intent: "recommendation" },
    { query: "affordable {category} brands", intent: "recommendation" },
    { query: "{brand} review is it worth it", intent: "research" },
    { query: "alternatives to {brand}", intent: "alternative" },
    { query: "best {category} for quality", intent: "recommendation" },
    { query: "{brand} vs competitors", intent: "comparison" },
    { query: "trending {category} brands", intent: "recommendation" },
    { query: "sustainable {category} brands", intent: "recommendation" },
    { query: "best {category} under $100", intent: "purchase" },
    { query: "top rated {category} brands online", intent: "recommendation" },
    { query: "best {category} for everyday wear", intent: "purchase" },
    { query: "luxury {category} brands worth it", intent: "research" },
  ],
};

// Generic fallback for any category
const GENERIC_QUERIES: QueryTemplate[] = [
  { query: "best {category} 2026", intent: "recommendation" },
  { query: "top {category} brands", intent: "recommendation" },
  { query: "best {category} for the money", intent: "purchase" },
  { query: "{brand} review", intent: "research" },
  { query: "is {brand} worth it 2026", intent: "research" },
  { query: "alternatives to {brand}", intent: "alternative" },
  { query: "{brand} vs competitors", intent: "comparison" },
  { query: "best {category} brands comparison", intent: "comparison" },
  { query: "affordable {category} recommendations", intent: "recommendation" },
  { query: "top rated {category} 2026", intent: "recommendation" },
  { query: "best premium {category}", intent: "recommendation" },
  { query: "{category} buying guide 2026", intent: "research" },
];

// Language-specific query prefixes
const LANGUAGE_TEMPLATES: Record<string, (q: string) => string> = {
  en: (q) => q,
  es: (q) => `mejor ${q}`.replace("best ", "").replace("top ", "mejores "),
  fr: (q) => `meilleur ${q}`.replace("best ", "").replace("top ", "meilleurs "),
  de: (q) => `beste ${q}`.replace("best ", "").replace("top ", "beste "),
  pt: (q) => `melhor ${q}`.replace("best ", "").replace("top ", "melhores "),
  ja: (q) => q, // Keep English for now, AI understands both
  ko: (q) => q,
  zh: (q) => q,
};

export function getQueriesForBrand(
  brand: string,
  category: string,
  language: string = "en",
  tier: "free" | "pro" | "business" | "enterprise" = "free"
): { query: string; intent: string }[] {
  const queryLimit = tier === "free" ? 12 : tier === "pro" ? 20 : tier === "business" ? 25 : 30;
  
  // Find category-specific queries, or fall back to generic
  const normalizedCategory = category.toLowerCase();
  let templates = GENERIC_QUERIES;
  
  for (const [key, value] of Object.entries(CATEGORY_QUERIES)) {
    if (normalizedCategory.includes(key.toLowerCase()) || key.toLowerCase().includes(normalizedCategory)) {
      templates = value;
      break;
    }
  }
  
  // Resolve placeholders
  const resolved = templates.slice(0, queryLimit).map(t => ({
    query: t.query.replace(/\{brand\}/g, brand).replace(/\{category\}/g, category),
    intent: t.intent,
  }));
  
  // Apply language transformation
  const langFn = LANGUAGE_TEMPLATES[language] || LANGUAGE_TEMPLATES.en;
  
  // Deduplicate
  const seen = new Set<string>();
  return resolved.filter(q => {
    const key = q.query.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(q => ({
    query: langFn(q.query),
    intent: q.intent,
  }));
}
