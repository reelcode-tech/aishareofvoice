// Category-specific query templates for AI engine queries
// Uses {brand} and {category} placeholders
// Each category has 30 templates to support all tiers:
//   Snapshot = 12, Monitor = 25, Agency = 30

interface QueryTemplate {
  query: string;
  intent: "purchase" | "comparison" | "recommendation" | "research" | "alternative";
}

const CATEGORY_QUERIES: Record<string, QueryTemplate[]> = {
  skincare: [
    // ── Snapshot (1–12) ──
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
    // ── Monitor (13–25) ──
    { query: "best skincare brands for acne-prone skin", intent: "recommendation" },
    { query: "luxury skincare brands ranked", intent: "recommendation" },
    { query: "best face wash for oily skin 2026", intent: "purchase" },
    { query: "which skincare brand has the best ingredients", intent: "research" },
    { query: "{brand} reviews from dermatologists", intent: "research" },
    { query: "best Korean skincare brands available in the US", intent: "recommendation" },
    { query: "niacinamide serum brand comparison", intent: "comparison" },
    { query: "best night cream for wrinkles", intent: "purchase" },
    { query: "skincare brands that actually work according to experts", intent: "recommendation" },
    { query: "best SPF moisturizer for daily use", intent: "purchase" },
    { query: "clean beauty vs traditional skincare which brands are better", intent: "comparison" },
    { query: "{brand} ingredient quality compared to competitors", intent: "comparison" },
    { query: "top 10 skincare brands dermatologists recommend", intent: "recommendation" },
    // ── Agency (26–30) ──
    { query: "best skincare subscription boxes 2026", intent: "recommendation" },
    { query: "which skincare brand has the strongest online reviews", intent: "research" },
    { query: "skincare brands with best sustainability practices", intent: "recommendation" },
    { query: "best {category} for men 2026", intent: "purchase" },
    { query: "{brand} customer complaints and common issues", intent: "research" },
  ],
  mattresses: [
    // ── Snapshot (1–12) ──
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
    // ── Monitor (13–25) ──
    { query: "best mattress for couples with different preferences", intent: "purchase" },
    { query: "mattress brands that ship free and have long trials", intent: "recommendation" },
    { query: "best firm mattress for stomach sleepers", intent: "purchase" },
    { query: "which mattress brand has the best return policy", intent: "research" },
    { query: "{brand} vs Casper vs Purple comparison", intent: "comparison" },
    { query: "best mattress under $1000 2026", intent: "purchase" },
    { query: "mattress brands recommended by chiropractors", intent: "recommendation" },
    { query: "best king size mattress for the money", intent: "purchase" },
    { query: "online mattress brands vs traditional store brands", intent: "comparison" },
    { query: "best adjustable bed and mattress combo", intent: "purchase" },
    { query: "which mattress brand lasts the longest", intent: "research" },
    { query: "{brand} customer satisfaction ratings", intent: "research" },
    { query: "top rated mattress brands consumer reports 2026", intent: "recommendation" },
    // ── Agency (26–30) ──
    { query: "best mattress for heavy people over 250 lbs", intent: "purchase" },
    { query: "mattress brands with best financing options", intent: "recommendation" },
    { query: "eco-friendly mattress brands comparison", intent: "comparison" },
    { query: "best mattress for guest room on a budget", intent: "purchase" },
    { query: "{brand} mattress durability after 5 years", intent: "research" },
  ],
  "CRM software": [
    // ── Snapshot (1–12) ──
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
    // ── Monitor (13–25) ──
    { query: "best CRM for real estate agents", intent: "purchase" },
    { query: "CRM with best mobile app", intent: "purchase" },
    { query: "{brand} pricing compared to competitors", intent: "comparison" },
    { query: "best CRM for startups 2026", intent: "recommendation" },
    { query: "CRM platforms with AI features", intent: "recommendation" },
    { query: "best CRM for B2B companies", intent: "purchase" },
    { query: "{brand} review pros and cons", intent: "research" },
    { query: "CRM software with best reporting and analytics", intent: "purchase" },
    { query: "which CRM has the best customer support", intent: "research" },
    { query: "best CRM for ecommerce businesses", intent: "purchase" },
    { query: "HubSpot vs Salesforce vs {brand}", intent: "comparison" },
    { query: "CRM migration guide which platform to switch to", intent: "research" },
    { query: "best CRM for nonprofit organizations", intent: "recommendation" },
    // ── Agency (26–30) ──
    { query: "CRM platforms with best API and integrations", intent: "purchase" },
    { query: "best CRM for marketing agencies", intent: "purchase" },
    { query: "CRM total cost of ownership comparison", intent: "comparison" },
    { query: "which CRM scales best as your team grows", intent: "research" },
    { query: "{brand} security and compliance features", intent: "research" },
  ],
  jewelry: [
    // ── Snapshot (1–12) ──
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
    // ── Monitor (13–25) ──
    { query: "best lab-grown diamond brands", intent: "recommendation" },
    { query: "jewelry brands with lifetime warranty", intent: "recommendation" },
    { query: "{brand} vs Mejuri vs Ana Luisa comparison", intent: "comparison" },
    { query: "best engagement ring brands 2026", intent: "purchase" },
    { query: "jewelry brands that hold their value", intent: "research" },
    { query: "best dainty jewelry brands for layering", intent: "purchase" },
    { query: "where to buy quality gold vermeil jewelry", intent: "purchase" },
    { query: "{brand} customer reviews and complaints", intent: "research" },
    { query: "best jewelry brands on Instagram 2026", intent: "recommendation" },
    { query: "ethical jewelry brands comparison", intent: "comparison" },
    { query: "best personalized jewelry brands", intent: "purchase" },
    { query: "jewelry brand quality tiers explained", intent: "research" },
    { query: "best online jewelry stores ranked", intent: "recommendation" },
    // ── Agency (26–30) ──
    { query: "best wedding band brands for men", intent: "purchase" },
    { query: "DTC jewelry brands disrupting the industry", intent: "recommendation" },
    { query: "best pearl jewelry brands 2026", intent: "purchase" },
    { query: "{brand} return policy and sizing accuracy", intent: "research" },
    { query: "jewelry brands with best packaging and unboxing experience", intent: "research" },
  ],
  fashion: [
    // ── Snapshot (1–12) ──
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
    // ── Monitor (13–25) ──
    { query: "best {category} brands for women over 30", intent: "recommendation" },
    { query: "DTC {category} brands worth trying", intent: "recommendation" },
    { query: "{brand} quality compared to similar brands", intent: "comparison" },
    { query: "best {category} brands that ship internationally", intent: "recommendation" },
    { query: "most popular {category} brands on TikTok 2026", intent: "recommendation" },
    { query: "best {category} for work and office wear", intent: "purchase" },
    { query: "{brand} sizing guide and fit review", intent: "research" },
    { query: "ethical {category} brands comparison", intent: "comparison" },
    { query: "best {category} for petite women", intent: "purchase" },
    { query: "capsule wardrobe brands {category} 2026", intent: "recommendation" },
    { query: "which {category} brand has the best return policy", intent: "research" },
    { query: "best {category} for plus size", intent: "purchase" },
    { query: "top {category} brands for minimalist style", intent: "recommendation" },
    // ── Agency (26–30) ──
    { query: "best {category} subscription services 2026", intent: "recommendation" },
    { query: "{brand} celebrity collaborations and partnerships", intent: "research" },
    { query: "best {category} brands for men 2026", intent: "purchase" },
    { query: "fastest growing {category} brands this year", intent: "recommendation" },
    { query: "{brand} customer loyalty and repeat purchase rate", intent: "research" },
  ],
  "athletic apparel": [
    // ── Snapshot (1–12) ──
    { query: "best athletic wear brands 2026", intent: "recommendation" },
    { query: "best yoga pants brands", intent: "purchase" },
    { query: "{brand} vs competitors which is better", intent: "comparison" },
    { query: "best workout clothes for women", intent: "purchase" },
    { query: "{brand} review worth the price", intent: "research" },
    { query: "alternatives to {brand}", intent: "alternative" },
    { query: "best running gear brands 2026", intent: "recommendation" },
    { query: "best leggings that don't pill", intent: "purchase" },
    { query: "is {brand} worth it 2026", intent: "research" },
    { query: "premium activewear brands comparison", intent: "comparison" },
    { query: "best gym clothes for men", intent: "purchase" },
    { query: "sustainable athletic wear brands", intent: "recommendation" },
    // ── Monitor (13–25) ──
    { query: "best running shorts brands 2026", intent: "purchase" },
    { query: "activewear brands with best size range", intent: "recommendation" },
    { query: "{brand} fabric quality and durability review", intent: "research" },
    { query: "best CrossFit workout gear brands", intent: "purchase" },
    { query: "Lululemon vs Nike vs {brand} comparison", intent: "comparison" },
    { query: "best moisture-wicking workout shirts", intent: "purchase" },
    { query: "activewear brands that double as streetwear", intent: "recommendation" },
    { query: "best compression gear brands for athletes", intent: "purchase" },
    { query: "which activewear brand has best customer reviews", intent: "research" },
    { query: "best athletic wear for plus size athletes", intent: "purchase" },
    { query: "DTC activewear brands disrupting the market", intent: "recommendation" },
    { query: "{brand} compared to Gymshark and Vuori", intent: "comparison" },
    { query: "best workout clothes that don't show sweat", intent: "purchase" },
    // ── Agency (26–30) ──
    { query: "best activewear brands for outdoor sports", intent: "purchase" },
    { query: "athletic wear brands with best return policy", intent: "recommendation" },
    { query: "{brand} athlete endorsements and sponsorships", intent: "research" },
    { query: "best activewear for hot weather training", intent: "purchase" },
    { query: "fastest growing activewear brands 2026", intent: "recommendation" },
  ],
  consulting: [
    // ── Snapshot (1–12) ──
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
    // ── Monitor (13–25) ──
    { query: "best consulting firms for AI and technology", intent: "purchase" },
    { query: "consulting firms with best culture and employee reviews", intent: "research" },
    { query: "{brand} consulting pricing and fee structure", intent: "research" },
    { query: "best boutique consulting firms 2026", intent: "recommendation" },
    { query: "consulting firms specializing in healthcare", intent: "purchase" },
    { query: "{brand} vs McKinsey vs Bain comparison", intent: "comparison" },
    { query: "best consulting firms for startups and scaleups", intent: "purchase" },
    { query: "consulting firms with strongest industry expertise", intent: "recommendation" },
    { query: "best consulting firms for supply chain optimization", intent: "purchase" },
    { query: "which consulting firm has the best client results", intent: "research" },
    { query: "consulting firms that specialize in M&A", intent: "purchase" },
    { query: "mid-tier consulting firms worth considering", intent: "recommendation" },
    { query: "{brand} case studies and notable projects", intent: "research" },
    // ── Agency (26–30) ──
    { query: "best consulting firms for ESG and sustainability", intent: "purchase" },
    { query: "consulting firms with best data analytics practice", intent: "recommendation" },
    { query: "fastest growing consulting firms 2026", intent: "recommendation" },
    { query: "{brand} partner and leadership team reputation", intent: "research" },
    { query: "consulting firms with strongest government sector work", intent: "purchase" },
  ],
  "AI writing tools": [
    // ── Snapshot (1–12) ──
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
    // ── Monitor (13–25) ──
    { query: "best AI writing tools for long-form content", intent: "purchase" },
    { query: "AI tools that write in your brand voice", intent: "recommendation" },
    { query: "{brand} accuracy and quality compared to competitors", intent: "comparison" },
    { query: "best AI tools for email marketing copy", intent: "purchase" },
    { query: "AI writing tools with plagiarism checker built in", intent: "recommendation" },
    { query: "{brand} integration with WordPress and CMS platforms", intent: "research" },
    { query: "best AI writing tools for agencies managing multiple clients", intent: "purchase" },
    { query: "AI content tools that support multiple languages", intent: "recommendation" },
    { query: "which AI writing tool produces the most human-like content", intent: "research" },
    { query: "best AI tools for product descriptions ecommerce", intent: "purchase" },
    { query: "{brand} vs Jasper vs Copy.ai comparison 2026", intent: "comparison" },
    { query: "AI writing tools with best team collaboration features", intent: "recommendation" },
    { query: "best AI writing assistant for academic and research content", intent: "purchase" },
    // ── Agency (26–30) ──
    { query: "AI writing tools with API access for developers", intent: "purchase" },
    { query: "best AI tools for press release writing", intent: "purchase" },
    { query: "{brand} data privacy and content ownership policy", intent: "research" },
    { query: "fastest AI writing tools for high volume content", intent: "recommendation" },
    { query: "AI writing tools pricing per word comparison", intent: "comparison" },
  ],
  "ecommerce platform": [
    // ── Snapshot (1–12) ──
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
    // ── Monitor (13–25) ──
    { query: "best ecommerce platform for B2B wholesale", intent: "purchase" },
    { query: "ecommerce platforms with best payment processing", intent: "recommendation" },
    { query: "{brand} transaction fees compared to competitors", intent: "comparison" },
    { query: "best ecommerce platform for digital products", intent: "purchase" },
    { query: "ecommerce platforms with built-in marketing tools", intent: "recommendation" },
    { query: "best ecommerce platform for international selling", intent: "purchase" },
    { query: "{brand} customer support quality review", intent: "research" },
    { query: "Shopify vs WooCommerce vs {brand} comparison", intent: "comparison" },
    { query: "best ecommerce platform for high volume stores", intent: "purchase" },
    { query: "ecommerce platforms with best inventory management", intent: "recommendation" },
    { query: "which ecommerce platform has best mobile experience", intent: "research" },
    { query: "best ecommerce platform for subscription products", intent: "purchase" },
    { query: "ecommerce platforms with best app ecosystems", intent: "recommendation" },
    // ── Agency (26–30) ──
    { query: "best headless ecommerce platforms 2026", intent: "recommendation" },
    { query: "ecommerce platform migration comparison guide", intent: "research" },
    { query: "{brand} API and developer ecosystem review", intent: "research" },
    { query: "best ecommerce platform for omnichannel retail", intent: "purchase" },
    { query: "ecommerce platforms total cost of ownership comparison", intent: "comparison" },
  ],
};

// Generic fallback for any category — 30 templates
const GENERIC_QUERIES: QueryTemplate[] = [
  // ── Snapshot (1–12) ──
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
  // ── Monitor (13–25) ──
  { query: "best {category} for beginners", intent: "recommendation" },
  { query: "best {category} for professionals", intent: "purchase" },
  { query: "{brand} pros and cons detailed review", intent: "research" },
  { query: "best {category} under $50", intent: "purchase" },
  { query: "which {category} brand has the best reputation", intent: "research" },
  { query: "{brand} compared to industry leaders", intent: "comparison" },
  { query: "most innovative {category} brands 2026", intent: "recommendation" },
  { query: "best {category} with free shipping", intent: "purchase" },
  { query: "{category} brands with best customer reviews", intent: "recommendation" },
  { query: "best sustainable {category} brands", intent: "recommendation" },
  { query: "which {category} brand has the best warranty", intent: "research" },
  { query: "{brand} customer satisfaction score", intent: "research" },
  { query: "top 10 {category} brands experts recommend", intent: "recommendation" },
  // ── Agency (26–30) ──
  { query: "fastest growing {category} brands 2026", intent: "recommendation" },
  { query: "{brand} market share and competitive position", intent: "research" },
  { query: "best {category} for enterprise use", intent: "purchase" },
  { query: "DTC {category} brands disrupting the market", intent: "recommendation" },
  { query: "{brand} long-term reliability and track record", intent: "research" },
];

// Full multi-language query templates — 30 per language
// Each language has natively-written purchase-intent queries (not machine-translated English)
const MULTILANG_QUERIES: Record<string, QueryTemplate[]> = {
  es: [
    // ── Snapshot (1–12) ──
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
    // ── Monitor (13–25) ──
    { query: "mejores {category} para principiantes", intent: "recommendation" },
    { query: "mejores {category} premium 2026", intent: "recommendation" },
    { query: "{brand} comparado con los lideres del mercado", intent: "comparison" },
    { query: "mejores {category} para profesionales", intent: "purchase" },
    { query: "marcas de {category} con mejor servicio al cliente", intent: "recommendation" },
    { query: "{brand} ventajas y desventajas", intent: "research" },
    { query: "mejores {category} sostenibles y ecologicos", intent: "recommendation" },
    { query: "que marca de {category} tiene mejor reputacion", intent: "research" },
    { query: "mejores {category} con envio gratis", intent: "purchase" },
    { query: "marcas de {category} mas innovadoras 2026", intent: "recommendation" },
    { query: "{brand} satisfaccion del cliente opiniones", intent: "research" },
    { query: "top 10 marcas de {category} recomendadas por expertos", intent: "recommendation" },
    { query: "mejores {category} por menos de 50 euros", intent: "purchase" },
    // ── Agency (26–30) ──
    { query: "marcas de {category} con mayor crecimiento 2026", intent: "recommendation" },
    { query: "{brand} cuota de mercado y posicion competitiva", intent: "research" },
    { query: "mejores {category} para empresas", intent: "purchase" },
    { query: "marcas de {category} DTC que estan cambiando el mercado", intent: "recommendation" },
    { query: "{brand} fiabilidad a largo plazo y trayectoria", intent: "research" },
  ],
  fr: [
    // ── Snapshot (1–12) ──
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
    // ── Monitor (13–25) ──
    { query: "meilleurs {category} pour debutants", intent: "recommendation" },
    { query: "meilleurs {category} haut de gamme 2026", intent: "recommendation" },
    { query: "{brand} compare aux leaders du marche", intent: "comparison" },
    { query: "meilleurs {category} pour professionnels", intent: "purchase" },
    { query: "marques de {category} avec meilleur service client", intent: "recommendation" },
    { query: "{brand} avantages et inconvenients", intent: "research" },
    { query: "meilleures marques de {category} eco-responsables", intent: "recommendation" },
    { query: "quelle marque de {category} a la meilleure reputation", intent: "research" },
    { query: "meilleurs {category} avec livraison gratuite", intent: "purchase" },
    { query: "marques de {category} les plus innovantes 2026", intent: "recommendation" },
    { query: "{brand} satisfaction client avis", intent: "research" },
    { query: "top 10 marques de {category} recommandees par experts", intent: "recommendation" },
    { query: "meilleurs {category} pour moins de 50 euros", intent: "purchase" },
    // ── Agency (26–30) ──
    { query: "marques de {category} en plus forte croissance 2026", intent: "recommendation" },
    { query: "{brand} part de marche et position concurrentielle", intent: "research" },
    { query: "meilleurs {category} pour les entreprises", intent: "purchase" },
    { query: "marques DTC de {category} qui changent le marche", intent: "recommendation" },
    { query: "{brand} fiabilite long terme et historique", intent: "research" },
  ],
  de: [
    // ── Snapshot (1–12) ──
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
    // ── Monitor (13–25) ──
    { query: "beste {category} fur Anfanger", intent: "recommendation" },
    { query: "beste Premium {category} 2026", intent: "recommendation" },
    { query: "{brand} im Vergleich zu Marktfuhrern", intent: "comparison" },
    { query: "beste {category} fur Profis", intent: "purchase" },
    { query: "{category} Marken mit bestem Kundenservice", intent: "recommendation" },
    { query: "{brand} Vor- und Nachteile", intent: "research" },
    { query: "nachhaltige {category} Marken Vergleich", intent: "recommendation" },
    { query: "welche {category} Marke hat den besten Ruf", intent: "research" },
    { query: "beste {category} mit kostenlosem Versand", intent: "purchase" },
    { query: "innovativste {category} Marken 2026", intent: "recommendation" },
    { query: "{brand} Kundenzufriedenheit Bewertungen", intent: "research" },
    { query: "Top 10 {category} Marken von Experten empfohlen", intent: "recommendation" },
    { query: "beste {category} unter 50 Euro", intent: "purchase" },
    // ── Agency (26–30) ──
    { query: "am schnellsten wachsende {category} Marken 2026", intent: "recommendation" },
    { query: "{brand} Marktanteil und Wettbewerbsposition", intent: "research" },
    { query: "beste {category} fur Unternehmen", intent: "purchase" },
    { query: "DTC {category} Marken die den Markt verandern", intent: "recommendation" },
    { query: "{brand} Langzeit-Zuverlassigkeit und Erfolgsbilanz", intent: "research" },
  ],
  pt: [
    // ── Snapshot (1–12) ──
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
    // ── Monitor (13–25) ──
    { query: "melhores {category} para iniciantes", intent: "recommendation" },
    { query: "melhores {category} premium 2026", intent: "recommendation" },
    { query: "{brand} comparado com lideres do mercado", intent: "comparison" },
    { query: "melhores {category} para profissionais", intent: "purchase" },
    { query: "marcas de {category} com melhor atendimento", intent: "recommendation" },
    { query: "{brand} vantagens e desvantagens", intent: "research" },
    { query: "marcas de {category} sustentaveis e ecologicas", intent: "recommendation" },
    { query: "qual marca de {category} tem melhor reputacao", intent: "research" },
    { query: "melhores {category} com frete gratis", intent: "purchase" },
    { query: "marcas de {category} mais inovadoras 2026", intent: "recommendation" },
    { query: "{brand} satisfacao do cliente avaliacoes", intent: "research" },
    { query: "top 10 marcas de {category} recomendadas por especialistas", intent: "recommendation" },
    { query: "melhores {category} por menos de 100 reais", intent: "purchase" },
    // ── Agency (26–30) ──
    { query: "marcas de {category} com maior crescimento 2026", intent: "recommendation" },
    { query: "{brand} participacao de mercado e posicao competitiva", intent: "research" },
    { query: "melhores {category} para empresas", intent: "purchase" },
    { query: "marcas DTC de {category} que estao mudando o mercado", intent: "recommendation" },
    { query: "{brand} confiabilidade de longo prazo e historico", intent: "research" },
  ],
  ja: [
    // ── Snapshot (1–12) ──
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
    // ── Monitor (13–25) ──
    { query: "初心者向け おすすめ {category}", intent: "recommendation" },
    { query: "プロ向け {category} ランキング", intent: "recommendation" },
    { query: "{brand} 業界トップとの比較", intent: "comparison" },
    { query: "プロが選ぶ {category} ブランド", intent: "purchase" },
    { query: "カスタマーサポートが良い {category} ブランド", intent: "recommendation" },
    { query: "{brand} メリット デメリット", intent: "research" },
    { query: "サステナブル {category} ブランド比較", intent: "recommendation" },
    { query: "評判が良い {category} ブランドはどれ", intent: "research" },
    { query: "送料無料 おすすめ {category}", intent: "purchase" },
    { query: "2026年 最も革新的な {category} ブランド", intent: "recommendation" },
    { query: "{brand} 顧客満足度 評価", intent: "research" },
    { query: "専門家が推薦する {category} トップ10", intent: "recommendation" },
    { query: "5000円以下 おすすめ {category}", intent: "purchase" },
    // ── Agency (26–30) ──
    { query: "急成長中の {category} ブランド 2026", intent: "recommendation" },
    { query: "{brand} 市場シェア 競争力", intent: "research" },
    { query: "企業向け {category} おすすめ", intent: "purchase" },
    { query: "DTC {category} ブランド 注目", intent: "recommendation" },
    { query: "{brand} 長期的な信頼性と実績", intent: "research" },
  ],
  ko: [
    // ── Snapshot (1–12) ──
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
    // ── Monitor (13–25) ──
    { query: "초보자용 추천 {category}", intent: "recommendation" },
    { query: "프리미엄 {category} 순위 2026", intent: "recommendation" },
    { query: "{brand} 업계 리더와 비교", intent: "comparison" },
    { query: "전문가용 {category} 브랜드", intent: "purchase" },
    { query: "고객 서비스 좋은 {category} 브랜드", intent: "recommendation" },
    { query: "{brand} 장점 단점", intent: "research" },
    { query: "친환경 {category} 브랜드 비교", intent: "recommendation" },
    { query: "평판 좋은 {category} 브랜드 어디", intent: "research" },
    { query: "무료배송 추천 {category}", intent: "purchase" },
    { query: "2026년 가장 혁신적인 {category} 브랜드", intent: "recommendation" },
    { query: "{brand} 고객 만족도 평가", intent: "research" },
    { query: "전문가 추천 {category} 톱10", intent: "recommendation" },
    { query: "5만원 이하 추천 {category}", intent: "purchase" },
    // ── Agency (26–30) ──
    { query: "급성장 {category} 브랜드 2026", intent: "recommendation" },
    { query: "{brand} 시장 점유율 경쟁 위치", intent: "research" },
    { query: "기업용 {category} 추천", intent: "purchase" },
    { query: "DTC {category} 브랜드 주목", intent: "recommendation" },
    { query: "{brand} 장기적 신뢰성과 실적", intent: "research" },
  ],
  zh: [
    // ── Snapshot (1–12) ──
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
    // ── Monitor (13–25) ──
    { query: "新手推荐 {category}", intent: "recommendation" },
    { query: "高端 {category} 排名 2026", intent: "recommendation" },
    { query: "{brand} 与行业领导者对比", intent: "comparison" },
    { query: "专业级 {category} 品牌", intent: "purchase" },
    { query: "售后服务最好的 {category} 品牌", intent: "recommendation" },
    { query: "{brand} 优缺点分析", intent: "research" },
    { query: "环保可持续 {category} 品牌对比", intent: "recommendation" },
    { query: "口碑最好的 {category} 品牌是哪个", intent: "research" },
    { query: "包邮推荐 {category}", intent: "purchase" },
    { query: "2026年最创新的 {category} 品牌", intent: "recommendation" },
    { query: "{brand} 客户满意度 评价", intent: "research" },
    { query: "专家推荐的 {category} 十大品牌", intent: "recommendation" },
    { query: "50元以下推荐 {category}", intent: "purchase" },
    // ── Agency (26–30) ──
    { query: "增长最快的 {category} 品牌 2026", intent: "recommendation" },
    { query: "{brand} 市场份额和竞争地位", intent: "research" },
    { query: "企业级 {category} 推荐", intent: "purchase" },
    { query: "DTC {category} 品牌 值得关注", intent: "recommendation" },
    { query: "{brand} 长期可靠性和业绩记录", intent: "research" },
  ],
};

export function getQueriesForBrand(
  brand: string,
  category: string,
  language: string = "en",
  tier: "snapshot" | "monitor" | "agency" | "free" | "pro" | "enterprise" = "snapshot"
): { query: string; intent: string }[] {
  // Tier query limits: Snapshot=12, Monitor=25, Agency=30
  // Also support legacy tier names
  const legacyMap: Record<string, string> = { "free": "snapshot", "pro": "monitor", "enterprise": "agency" };
  const normalizedTier = legacyMap[tier] || tier;
  const queryLimit = normalizedTier === "snapshot" ? 12 : normalizedTier === "monitor" ? 25 : 30;
  
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
  
  // Resolve placeholders — use queryLimit to take the right number
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
