// Known domain → brand mappings for bot-protected and JS-rendered sites
const KNOWN_DOMAIN_BRANDS: Record<string, { brand: string; category: string }> = {
  "zara.com": { brand: "Zara", category: "fashion" },
  "nike.com": { brand: "Nike", category: "sneakers" },
  "apple.com": { brand: "Apple", category: "electronics" },
  "google.com": { brand: "Google", category: "technology" },
  "amazon.com": { brand: "Amazon", category: "ecommerce" },
  "sephora.com": { brand: "Sephora", category: "beauty" },
  "dyson.com": { brand: "Dyson", category: "home appliances" },
  "saatva.com": { brand: "Saatva", category: "mattresses" },
  "casper.com": { brand: "Casper", category: "mattresses" },
  "purple.com": { brand: "Purple", category: "mattresses" },
  "cerave.com": { brand: "CeraVe", category: "skincare" },
  "theordinary.com": { brand: "The Ordinary", category: "skincare" },
  "versed.com": { brand: "Versed", category: "skincare" },
  "versedskin.com": { brand: "Versed", category: "skincare" },
  "lamer.com": { brand: "La Mer", category: "luxury skincare" },
  "hubspot.com": { brand: "HubSpot", category: "CRM software" },
  "salesforce.com": { brand: "Salesforce", category: "CRM software" },
  "pipedrive.com": { brand: "Pipedrive", category: "CRM software" },
  "claires.com": { brand: "Claire's", category: "jewelry" },
  "pandora.net": { brand: "Pandora", category: "jewelry" },
  "tiffany.com": { brand: "Tiffany & Co.", category: "jewelry" },
  "mejuri.com": { brand: "Mejuri", category: "jewelry" },
  "liatbenzur.com": { brand: "LBZ Advisory", category: "consulting" },
  "glossier.com": { brand: "Glossier", category: "beauty" },
  "drunk-elephant.com": { brand: "Drunk Elephant", category: "skincare" },
  "paulaschoice.com": { brand: "Paula's Choice", category: "skincare" },
  "theinkeylist.com": { brand: "The Inkey List", category: "skincare" },
  "skinceuticals.com": { brand: "SkinCeuticals", category: "skincare" },
  "laroche-posay.us": { brand: "La Roche-Posay", category: "skincare" },
  "herbivore.com": { brand: "Herbivore Botanicals", category: "skincare" },
  "youthtothepeople.com": { brand: "Youth To The People", category: "skincare" },
  "osea.com": { brand: "OSEA", category: "skincare" },
  "narscosmetics.com": { brand: "NARS", category: "beauty" },
  "dove.com": { brand: "Dove", category: "personal care" },
  "olay.com": { brand: "Olay", category: "skincare" },
  "tempurpedic.com": { brand: "Tempur-Pedic", category: "mattresses" },
  "tuftandneedle.com": { brand: "Tuft & Needle", category: "mattresses" },
  "linenspa.com": { brand: "Linenspa", category: "mattresses" },
  "zoho.com": { brand: "Zoho", category: "CRM software" },
  "monday.com": { brand: "Monday.com", category: "project management" },
  "slack.com": { brand: "Slack", category: "communication" },
  "notion.so": { brand: "Notion", category: "productivity" },
  "lululemon.com": { brand: "Lululemon", category: "athletic apparel" },
  "lululemon.ca": { brand: "Lululemon", category: "athletic apparel" },
  "allbirds.com": { brand: "Allbirds", category: "sustainable footwear" },
  "warbyparker.com": { brand: "Warby Parker", category: "eyewear" },
  "peloton.com": { brand: "Peloton", category: "fitness equipment" },
  "away.com": { brand: "Away", category: "luggage" },
  "brooklinen.com": { brand: "Brooklinen", category: "bedding" },
  "everlane.com": { brand: "Everlane", category: "fashion" },
  "bombas.com": { brand: "Bombas", category: "socks and apparel" },
  "hims.com": { brand: "Hims", category: "men's health" },
  "hers.com": { brand: "Hers", category: "women's health" },
  "canva.com": { brand: "Canva", category: "design software" },
  "figma.com": { brand: "Figma", category: "design software" },
  "linear.app": { brand: "Linear", category: "project management" },
  "asana.com": { brand: "Asana", category: "project management" },
  "airtable.com": { brand: "Airtable", category: "database software" },
  "shopify.com": { brand: "Shopify", category: "ecommerce platform" },
  "stripe.com": { brand: "Stripe", category: "payment processing" },
  "intercom.com": { brand: "Intercom", category: "customer messaging" },
  "zendesk.com": { brand: "Zendesk", category: "customer support" },
  "mailchimp.com": { brand: "Mailchimp", category: "email marketing" },
  "semrush.com": { brand: "Semrush", category: "SEO software" },
  "ahrefs.com": { brand: "Ahrefs", category: "SEO software" },
};

// Brand alias resolution for truncated names from AI responses
const BRAND_ALIASES: Record<string, string> = {
  "cerave": "CeraVe",
  "la roche": "La Roche-Posay",
  "la roche-pos": "La Roche-Posay",
  "the ordinary": "The Ordinary",
  "the ord": "The Ordinary",
  "drunk elephant": "Drunk Elephant",
  "drunk ele": "Drunk Elephant",
  "paula": "Paula's Choice",
  "paula's": "Paula's Choice",
  "the in": "The Inkey List",
  "the inkey": "The Inkey List",
  "skince": "SkinCeuticals",
  "skinceut": "SkinCeuticals",
  "herbivore": "Herbivore Botanicals",
  "youth to": "Youth To The People",
  "tuft": "Tuft & Needle",
  "tuft &": "Tuft & Needle",
  "lin": "Linenspa",
  "tempur": "Tempur-Pedic",
  "tempur-ped": "Tempur-Pedic",
  "pedic tempur": "Tempur-Pedic",
  "pedic": "Tempur-Pedic",
  "tiffany": "Tiffany & Co.",
  "piped": "Pipedrive",
  "herb": "Herbivore Botanicals",
};

// Noise words that should NOT be extracted as brand names
const NOISE_WORDS = new Set([
  "popular", "affordable", "expensive", "cruelty", "polarizing", "premium",
  "luxury", "professional", "advanced", "natural", "organic", "clean",
  "gentle", "effective", "powerful", "innovative", "sustainable", "ethical",
  "clinical", "dermatologist", "recommended", "trusted", "leading", "best",
  "top", "quality", "high", "low", "good", "great", "amazing", "excellent",
  "mixed", "mostly", "widely", "generally", "particularly", "especially",
  "however", "although", "furthermore", "additionally", "important",
  // Generic product terms that AI mentions as categories, not brands
  "moisturizer", "sunscreen", "cleanser", "serum", "toner", "retinol",
  "mattress", "pillow", "topper", "bedding", "sheets",
  "morning", "evening", "daily", "nightly", "routine",
  "lightweight", "hydrating", "brightening", "anti-aging", "sensitive",
  "budget", "drugstore", "high-end", "mid-range", "starter",
  "alternative", "competitor", "comparison", "review", "recommendation",
]);

const NOISE_PHRASES = [
  "mixed reviews", "widely used", "mostly positive", "quality testing",
  "cruelty-free", "board certified", "dermatologist recommended",
  "clinically proven", "all natural", "clean beauty",
  "prone skin", "dry skin", "oily skin", "sensitive skin", "combination skin",
  "uv clear", "ultra sheer", "broad spectrum",
  "side sleeper", "back sleeper", "hot sleeper",
  "small business", "sales team", "customer service",
];

export function normalizeBrandName(raw: string): string | null {
  let name = raw.trim();
  
  // Strip HTML entities
  name = name.replace(/&nbsp;/gi, "").replace(/&amp;/gi, "&").trim();
  
  // Strip trailing hyphens, parens, quotes
  name = name.replace(/[-–—'"()]+$/, "").trim();
  
  // Strip leading/trailing quotes
  name = name.replace(/^["']+|["']+$/g, "").trim();
  
  // Strip .com and regional suffixes
  name = name.replace(/\.(com|net|org|co|io|ai|us|uk)$/i, "").trim();
  name = name.replace(/\s+(US|UK|EU|Global|Home)\s*[-–]?\s*$/i, "").trim();
  name = name.replace(/^Home\s*[-–]\s*/i, "").trim();
  
  if (!name || name.length < 2) return null;
  
  // Check noise words
  if (NOISE_WORDS.has(name.toLowerCase())) return null;
  
  // Check noise phrases
  for (const phrase of NOISE_PHRASES) {
    if (name.toLowerCase().includes(phrase)) return null;
  }
  
  // Check aliases (exact match first)
  const lower = name.toLowerCase();
  if (BRAND_ALIASES[lower]) return BRAND_ALIASES[lower];
  
  // Prefix matching: if 4+ chars and is a prefix of any alias key
  if (name.length >= 4) {
    for (const [key, canonical] of Object.entries(BRAND_ALIASES)) {
      if (key.startsWith(lower) || lower.startsWith(key)) {
        return canonical;
      }
    }
  }
  
  return name;
}

export function detectBrandFromUrl(url: string): { brand: string; category: string } | null {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    const hostname = parsed.hostname.replace("www.", "");
    
    // Check known domains
    if (KNOWN_DOMAIN_BRANDS[hostname]) {
      return KNOWN_DOMAIN_BRANDS[hostname];
    }
    
    // Extract brand from domain name
    const parts = hostname.split(".");
    let brand = parts[0];
    brand = brand.charAt(0).toUpperCase() + brand.slice(1);
    
    // Return empty category — will be inferred by AI in detectCategoryWithAI()
    return { brand, category: "" };
  } catch {
    return null;
  }
}

/**
 * Use AI to infer the business category when we can't detect it from the domain.
 * Fetches the homepage, then asks an LLM to categorize the business.
 */
export interface CategoryDetectionResult {
  category: string;
  confidence: "high" | "medium" | "low";
  reason: string;
  source: "known_domain" | "ai_inferred";
}

export async function detectCategoryWithAI(url: string, brandName: string): Promise<CategoryDetectionResult> {
  try {
    // Try to fetch homepage for context
    let siteContext = "";
    let hadSiteContext = false;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const resp = await fetch(url.startsWith("http") ? url : `https://${url}`, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ASOVBot/1.0)" },
      });
      clearTimeout(timeoutId);
      if (resp.ok) {
        const html = await resp.text();
        const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
        const descMatch = html.match(/name="description"[^>]*content="([^"]*)"/i) ||
                          html.match(/content="([^"]*)"[^>]*name="description"/i);
        const title = titleMatch?.[1]?.trim() || "";
        const desc = descMatch?.[1]?.trim() || "";
        siteContext = `Website title: "${title}". Meta description: "${desc}".`;
        hadSiteContext = !!(title || desc);
      }
    } catch {
      // Site may be bot-protected, that's fine
    }
    
    const systemMsg = "You are a brand analyst. Respond with JSON only, no markdown.";
    const prompt = `What business category does the brand "${brandName}" belong to?

URL: ${url}
${siteContext}

Important: Base your answer on your knowledge of the brand "${brandName}" first. Only use the website metadata as a secondary signal.

Respond in exactly this JSON format (no markdown):
{"category": "<short category name>", "confidence": "<high|medium|low>", "reason": "<one sentence: why this category>"}

Confidence guide:
- high: well-known brand with unambiguous category (e.g. CeraVe → skincare)
- medium: clear from site content but brand isn't widely known
- low: inferred from limited signals, user should verify

Category must be a short, specific label like: skincare, mattresses, CRM software, jewelry, fashion, consulting, AI writing tools, ecommerce platform, project management, etc.`;

    // Multi-provider: Claude → OpenAI → Gemini
    let text = "";

    // 1. Try Claude
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey && !text) {
      try {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: "claude-haiku-4-5", max_tokens: 128,
            system: systemMsg,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (r.ok) {
          const data = await r.json() as any;
          text = (data.content?.map((c: any) => c.type === "text" ? c.text : "").join("") || "").trim();
        }
      } catch { /* next provider */ }
    }

    // 2. Try OpenAI
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey && !text) {
      try {
        const r = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openaiKey}` },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: systemMsg }, { role: "user", content: prompt }],
            max_tokens: 128, temperature: 0.2,
          }),
        });
        if (r.ok) {
          const data = await r.json() as any;
          text = (data.choices?.[0]?.message?.content || "").trim();
        }
      } catch { /* next provider */ }
    }

    // 3. Try Gemini
    const geminiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (geminiKey && !text) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemMsg }] },
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 128 },
          }),
        });
        if (r.ok) {
          const data = await r.json() as any;
          text = (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
        }
      } catch { /* no more providers */ }
    }

    if (!text) {
      return { category: "general", confidence: "low", reason: "All AI providers failed", source: "ai_inferred" };
    }
    
    // Try to parse as JSON
    try {
      const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      const parsed = JSON.parse(cleaned);
      const cat = (parsed.category || "").toLowerCase().replace(/^["']+|["']+$/g, "").replace(/\.\s*$/, "").trim();
      const conf = ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "medium";
      const reason = (parsed.reason || "").trim();
      
      if (cat && cat.split(/\s+/).length <= 5 && cat.length < 50) {
        return { category: cat, confidence: conf, reason, source: "ai_inferred" };
      }
    } catch {
      // Fallback: treat entire text as category name (backward compat)
      const cleaned = text.toLowerCase().replace(/^["']+|["']+$/g, "").replace(/\.\s*$/, "").trim();
      if (cleaned && cleaned.split(/\s+/).length <= 5 && cleaned.length < 50) {
        return {
          category: cleaned,
          confidence: hadSiteContext ? "medium" : "low",
          reason: hadSiteContext ? `Inferred from ${brandName}'s website content` : `Best guess based on the brand name`,
          source: "ai_inferred",
        };
      }
    }
    
    return { category: "general", confidence: "low", reason: "Could not determine category — please select manually", source: "ai_inferred" };
  } catch (err: any) {
    console.error("[Category Detection] AI fallback failed:", err.message);
    return { category: "general", confidence: "low", reason: "Detection failed — please select manually", source: "ai_inferred" };
  }
}

export function isServiceBrand(brandName: string, category: string): boolean {
  const serviceCategories = [
    "consulting", "advisory", "legal", "accounting", 
    "marketing agency", "design agency", "software consulting",
  ];
  const serviceKeywords = ["advisory", "consulting", "partners", "associates", "group", "agency"];
  
  if (serviceCategories.some(c => category.toLowerCase().includes(c))) return true;
  if (serviceKeywords.some(k => brandName.toLowerCase().includes(k))) return true;
  
  return false;
}
