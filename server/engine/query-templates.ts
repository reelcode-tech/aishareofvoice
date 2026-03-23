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
  consulting: [
    { query: "best consulting firms 2026", intent: "recommendation" },
    { query: "top management consulting companies", intent: "recommendation" },
    { query: "{brand} review and reputation", intent: "research" },
    { query: "alternatives to {brand} consulting", intent: "alternative" },
    { query: "{brand} vs competitors comparison", intent: "comparison" },
    { query: "best consulting firms for digital transformation", intent: "purchase" },
    { query: "top strategy consulting firms ranked", intent: "recommendation" },
    { query: "Big Four vs MBB consulting comparison", intent: "comparison" },
    { query: "best consulting firms for small business", intent: "purchase" },
    { query: "is {brand} worth hiring 2026", intent: "research" },
    { query: "consulting firm specializations comparison", intent: "comparison" },
    { query: "most prestigious consulting firms", intent: "recommendation" },
  ],
  "AI writing tools": [
    { query: "best AI writing tools 2026", intent: "recommendation" },
    { query: "best AI content generator for marketing", intent: "purchase" },
    { query: "{brand} review is it worth it", intent: "research" },
    { query: "alternatives to {brand}", intent: "alternative" },
    { query: "{brand} vs ChatGPT for writing", intent: "comparison" },
    { query: "best AI tools for blog writing", intent: "purchase" },
    { query: "AI copywriting tool comparison", intent: "comparison" },
    { query: "best free AI writing assistant", intent: "recommendation" },
    { query: "AI writing tools for SEO content", intent: "purchase" },
    { query: "is {brand} better than ChatGPT for content", intent: "comparison" },
    { query: "best AI tools for social media copy", intent: "purchase" },
    { query: "enterprise AI writing platform comparison", intent: "comparison" },
  ],
  "ecommerce platform": [
    { query: "best ecommerce platform 2026", intent: "recommendation" },
    { query: "best online store builder for small business", intent: "purchase" },
    { query: "{brand} review and pricing", intent: "research" },
    { query: "alternatives to {brand}", intent: "alternative" },
    { query: "{brand} vs competitors comparison", intent: "comparison" },
    { query: "easiest ecommerce platform to use", intent: "recommendation" },
    { query: "best ecommerce platform for dropshipping", intent: "purchase" },
    { query: "cheapest ecommerce platforms comparison", intent: "comparison" },
    { query: "best ecommerce platform for SEO", intent: "purchase" },
    { query: "is {brand} worth it for online store", intent: "research" },
    { query: "ecommerce platform features comparison 2026", intent: "comparison" },
    { query: "best ecommerce platform for beginners", intent: "recommendation" },
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

// Full multi-language query templates
// Each language has natively-written purchase-intent queries (not machine-translated English)
const MULTILANG_QUERIES: Record<string, QueryTemplate[]> = {
  es: [
    { query: "mejores {category} 2026", intent: "recommendation" },
    { query: "mejor {category} calidad precio", intent: "purchase" },
    { query: "opiniones de {brand}", intent: "research" },
    { query: "alternativas a {brand}", intent: "alternative" },
    { query: "{brand} vs competidores cual es mejor", intent: "comparison" },
    { query: "marcas de {category} recomendadas", intent: "recommendation" },
    { query: "vale la pena {brand} 2026", intent: "research" },
    { query: "comparativa mejores {category}", intent: "comparison" },
    { query: "{category} mas vendidos", intent: "recommendation" },
    { query: "guia de compra {category} 2026", intent: "research" },
    { query: "mejores marcas de {category} economicas", intent: "purchase" },
    { query: "que {category} comprar en 2026", intent: "purchase" },
  ],
  fr: [
    { query: "meilleurs {category} 2026", intent: "recommendation" },
    { query: "meilleur {category} rapport qualite prix", intent: "purchase" },
    { query: "avis {brand}", intent: "research" },
    { query: "alternatives a {brand}", intent: "alternative" },
    { query: "{brand} vs concurrents lequel choisir", intent: "comparison" },
    { query: "marques de {category} recommandees", intent: "recommendation" },
    { query: "est-ce que {brand} vaut le coup", intent: "research" },
    { query: "comparatif {category} 2026", intent: "comparison" },
    { query: "{category} les plus populaires", intent: "recommendation" },
    { query: "guide d'achat {category} 2026", intent: "research" },
    { query: "meilleures marques de {category} pas cher", intent: "purchase" },
    { query: "quel {category} acheter en 2026", intent: "purchase" },
  ],
  de: [
    { query: "beste {category} 2026", intent: "recommendation" },
    { query: "bester {category} Preis Leistung", intent: "purchase" },
    { query: "{brand} Erfahrungen", intent: "research" },
    { query: "Alternativen zu {brand}", intent: "alternative" },
    { query: "{brand} vs Konkurrenz Vergleich", intent: "comparison" },
    { query: "empfehlenswerte {category} Marken", intent: "recommendation" },
    { query: "lohnt sich {brand} 2026", intent: "research" },
    { query: "{category} Vergleich 2026", intent: "comparison" },
    { query: "beliebteste {category}", intent: "recommendation" },
    { query: "{category} Kaufberatung 2026", intent: "research" },
    { query: "gunstige {category} mit guter Qualitat", intent: "purchase" },
    { query: "welche {category} kaufen 2026", intent: "purchase" },
  ],
  pt: [
    { query: "melhores {category} 2026", intent: "recommendation" },
    { query: "melhor {category} custo beneficio", intent: "purchase" },
    { query: "avaliacoes {brand}", intent: "research" },
    { query: "alternativas ao {brand}", intent: "alternative" },
    { query: "{brand} vs concorrentes qual melhor", intent: "comparison" },
    { query: "marcas de {category} recomendadas", intent: "recommendation" },
    { query: "{brand} vale a pena 2026", intent: "research" },
    { query: "comparativo {category} 2026", intent: "comparison" },
    { query: "{category} mais vendidos", intent: "recommendation" },
    { query: "guia de compra {category} 2026", intent: "research" },
    { query: "melhores marcas de {category} baratas", intent: "purchase" },
    { query: "qual {category} comprar em 2026", intent: "purchase" },
  ],
  ja: [
    { query: "おすすめ {category} 2026", intent: "recommendation" },
    { query: "コスパ最強 {category}", intent: "purchase" },
    { query: "{brand} 口コミ 評判", intent: "research" },
    { query: "{brand} 代わり おすすめ", intent: "alternative" },
    { query: "{brand} vs 競合 比較", intent: "comparison" },
    { query: "人気 {category} ブランド", intent: "recommendation" },
    { query: "{brand} 買う価値ある 2026", intent: "research" },
    { query: "{category} 比較 ランキング 2026", intent: "comparison" },
    { query: "売れ筋 {category}", intent: "recommendation" },
    { query: "{category} 選び方 ガイド 2026", intent: "research" },
    { query: "安い {category} おすすめ", intent: "purchase" },
    { query: "2026年 {category} 何を買うべき", intent: "purchase" },
  ],
  ko: [
    { query: "추천 {category} 2026", intent: "recommendation" },
    { query: "가성비 좋은 {category}", intent: "purchase" },
    { query: "{brand} 후기 리뷰", intent: "research" },
    { query: "{brand} 대안 추천", intent: "alternative" },
    { query: "{brand} vs 경쟁사 비교", intent: "comparison" },
    { query: "인기 {category} 브랜드", intent: "recommendation" },
    { query: "{brand} 살만한가 2026", intent: "research" },
    { query: "{category} 비교 순위 2026", intent: "comparison" },
    { query: "베스트셀러 {category}", intent: "recommendation" },
    { query: "{category} 구매 가이드 2026", intent: "research" },
    { query: "저렴한 {category} 추천", intent: "purchase" },
    { query: "2026년 {category} 뭐 살까", intent: "purchase" },
  ],
  zh: [
    { query: "最好的 {category} 2026", intent: "recommendation" },
    { query: "性价比高的 {category}", intent: "purchase" },
    { query: "{brand} 评价 口碑", intent: "research" },
    { query: "{brand} 替代品 推荐", intent: "alternative" },
    { query: "{brand} 和竞品 对比", intent: "comparison" },
    { query: "热门 {category} 品牌 推荐", intent: "recommendation" },
    { query: "{brand} 值得买吗 2026", intent: "research" },
    { query: "{category} 对比 排行 2026", intent: "comparison" },
    { query: "最畅销 {category}", intent: "recommendation" },
    { query: "{category} 购买指南 2026", intent: "research" },
    { query: "便宜好用的 {category}", intent: "purchase" },
    { query: "2026年 买什么 {category}", intent: "purchase" },
  ],
};

export function getQueriesForBrand(
  brand: string,
  category: string,
  language: string = "en",
  tier: "free" | "pro" | "business" | "enterprise" = "free"
): { query: string; intent: string }[] {
  const queryLimit = tier === "free" ? 12 : tier === "pro" ? 20 : tier === "business" ? 25 : 30;
  
  // For non-English languages, use the natively-written templates
  if (language !== "en" && MULTILANG_QUERIES[language]) {
    const templates = MULTILANG_QUERIES[language];
    const resolved = templates.slice(0, queryLimit).map(t => ({
      query: t.query.replace(/\{brand\}/g, brand).replace(/\{category\}/g, category),
      intent: t.intent,
    }));
    
    const seen = new Set<string>();
    return resolved.filter(q => {
      const key = q.query.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  
  // English: find category-specific queries, or fall back to generic
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
  
  // Deduplicate
  const seen = new Set<string>();
  return resolved.filter(q => {
    const key = q.query.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
