// Multi-engine AI query layer
// Free tier: Gemini + ChatGPT (2 engines)
// Pro tier: + Claude (3 engines)  
// Business: + Grok (4 engines)
// Enterprise: + Perplexity (5 engines)

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

interface EngineResult {
  engine: string;
  model: string;
  query: string;
  response: string;
  mentionsBrand: boolean;
  mentionedBrands: string[];
  sentiment: "positive" | "neutral" | "negative" | "not_mentioned";
  citations: string[];
  timestamp: string;
}

interface EngineConfig {
  name: string;
  tier: "free" | "pro" | "business" | "enterprise";
  queryFn: (query: string, systemPrompt?: string) => Promise<{ response: string }>;
  model: string;
}

// Phrases that should never be extracted as brand names
const BRAND_NOISE_PATTERNS = new Set([
  // English ranking/editorial labels
  "best overall", "best for", "best value", "best budget", "best premium",
  "best luxury", "best selling", "runner up", "runner-up", "runners up",
  "honorable mention", "editor's choice", "editor pick", "editors pick",
  "our pick", "top pick", "top choice", "our top", "our favorite",
  "most popular", "most affordable", "most comfortable", "most durable",
  // Product attributes / category terms
  "key features", "pros and cons", "pros", "cons", "features",
  "firmness", "firmness level", "zoned support", "lumbar support",
  "memory foam", "hybrid mattress", "pillow top", "coil count",
  "sleep trial", "warranty", "free shipping", "price range",
  "trial and warranty", "trial period", "cooling", "feel", "type",
  "shipping", "price", "budget", "value", "construction",
  "motion isolation", "edge support", "durability", "comfort",
  // Article structure words
  "things to consider", "what to look for", "how to choose",
  "final thoughts", "the bottom line", "in conclusion", "summary",
  "important note", "disclaimer", "frequently asked", "faq",
  "the verdict", "performance metrics", "phase",
  // Indonesian noise (ChatGPT sometimes responds in other languages)
  "kelebihan", "kekurangan", "catatan praktis", "keunikan",
  "cocok untuk", "tipe utama", "rasanya", "varian utama",
  "pertimbangkan hal", "apa itu", "harga relatif",
  "pilihan kekerasan", "dukungan dan daya tahan",
  // Common false positives from AI list formatting
  "why worth it", "why consider", "what to know", "price vibe",
  "how you sleep", "best for side sleepers", "best for back sleepers",
  "best for back pain", "best for cooling", "best for pressure relief",
  "best for heavy people", "best for stomach sleepers",
  "best for side sleepers", "best for couples",
  "best for hot sleepers", "best all",
  "prorated", "non-prorated", "tech",
]);

// Words that indicate a descriptor, not a brand
const DESCRIPTOR_STARTS = [
  "best ", "top ", "most ", "our ", "the best", "a great", "an excellent",
  "highly ", "overall ", "also ", "another ", "other ",
  "here are", "here is", "there are", "these ", "those ",
  "some ", "many ", "several ", "various ", "different ",
  "how to", "what to", "when to", "why ", "where to",
];

function isBrandNoise(candidate: string): boolean {
  const lower = candidate.toLowerCase().trim();
  
  // Exact noise phrase matches
  if (BRAND_NOISE_PATTERNS.has(lower)) return true;
  
  // Starts with a descriptor word
  for (const prefix of DESCRIPTOR_STARTS) {
    if (lower.startsWith(prefix)) return true;
  }
  
  // All lowercase = likely not a brand (brands are usually capitalized)
  if (candidate === candidate.toLowerCase() && candidate.length > 3) return true;
  
  // Too many words (brands are rarely more than 4 words)
  if (candidate.split(/\s+/).length > 4) return true;
  
  // Contains only generic adjective-like words
  const genericWords = new Set(["premium", "luxury", "budget", "affordable", "comfortable", "firm", "soft", "medium", "organic", "natural", "hybrid", "classic", "original", "standard", "basic", "advanced", "professional", "ultimate", "elite", "signature"]);
  const words = lower.split(/\s+/);
  if (words.every(w => genericWords.has(w))) return true;
  
  // Ends with a product descriptor or user persona (sub-product, not brand)
  const productSuffixes = [" mattress", " pillow", " topper", " sheet", " base", " frame", " foundation", " protector", " sleepers", " sleeper", " people", " options", " position", " preferences"];
  for (const suffix of productSuffixes) {
    if (lower.endsWith(suffix)) return true;
  }
  
  // Single-word common English words that aren't brands
  if (words.length === 1) {
    const commonWords = new Set(["cooling", "feel", "type", "shipping", "price", "budget", "value",
      "warranty", "trial", "pros", "cons", "features", "construction", "materials",
      "summary", "durability", "comfort", "support", "motion", "transfer", "delivery",
      "returns", "comparison", "rating", "review", "score", "verdict", "conclusion",
      "latex", "foam", "hybrid", "coils", "springs", "layers", "cover",
      "excellent", "superior", "average", "high", "low", "moderate",
      "certifications", "certification", "materials", "ingredients", "specifications",
      "temperature", "breathability", "firmness", "density",
      // Non-English common words appearing in AI responses
      "kelebihan", "kekurangan", "keunikan", "rasanya", "cocok",
    ]);
    if (commonWords.has(lower)) return true;
  }
  
  return false;
}

// Additional validation for extracted brand candidates
// Returns true if the candidate looks like a real brand, false if it's noise
function isLikelyBrand(candidate: string): boolean {
  const lower = candidate.toLowerCase().trim();
  
  // Too short or too long
  if (candidate.length < 2 || candidate.length > 35) return false;
  
  // Too many words (real brand names are rarely >4 words)
  if (candidate.split(/\s+/).length > 4) return false;
  
  // Reject common instruction/heading patterns
  const instructionPatterns = [
    /^(start|try|use|look|apply|wear|pick|choose|consider|check|avoid|find|get|make|do|don'?t|if you)/i,
    /^(why|how|what|when|where|which|who|tip|note|key|core|quick|example|ideal)/i,
    /^(all|any|some|many|every|each|both|either|neither|no |the |a |an )/i,
    /(skin|sleeper|features?|benefits?|ingredients?|options?|preferences?|position|compliance)$/i,
    /^(pros|cons|strengths|limitations|pricing|typical|summary|verdict|conclusion|overview)/i,
    /^(step|phase|stage|level|tier|plan|option|section|category|type|kind|sort)/i,
    /(friendly|backed|based|driven|focused|powered|oriented|sensitive|prone|proof)$/i,
    /^(free|open|paid|low|mid|high|full|half|ultra|super|mega|micro|mini|nano|bio|neuro)/i,
    /^(next|new|old|modern|classic|original|standard|basic|advanced|professional|ultimate|elite)/i,
  ];
  for (const p of instructionPatterns) {
    if (p.test(candidate)) return false;
  }
  
  // Reject ingredient/attribute names common in skincare, mattresses, etc.
  const ingredientNoiseWords = new Set([
    "ceramides", "niacinamide", "retinol", "hyaluronic acid", "salicylic acid",
    "vitamin c", "vitamin e", "bakuchiol", "peptides", "collagen", "spf",
    "memory foam", "latex", "hybrid", "innerspring", "coils",
    "fragrance", "organic", "vegan", "cruelty",
  ]);
  if (ingredientNoiseWords.has(lower)) return false;
  
  return true;
}

// Extract brands mentioned in AI response
function extractBrands(response: string, targetBrand: string): {
  mentionsBrand: boolean;
  mentionedBrands: string[];
} {
  const text = response.toLowerCase();
  const targetLower = targetBrand.toLowerCase();
  
  // Check if target brand is mentioned
  const mentionsBrand = text.includes(targetLower) || 
    text.includes(targetLower.replace(/['']/g, "")) ||
    text.includes(targetLower.replace(/\s+/g, ""));
  
  // Primary extraction: bold text (**BrandName**) — most reliable since we instruct the AI to bold brands
  const mentionedBrands = new Set<string>();
  
  // Pattern 1 (highest priority): **Bold brand names** — the system prompt tells AI to do this
  const boldPattern = /\*\*([A-Z][A-Za-z\s&'.()\-/]+?)\*\*/g;
  let match;
  while ((match = boldPattern.exec(response)) !== null) {
    const brand = match[1].trim().replace(/\*+/g, "");
    const brandLower = brand.toLowerCase();
    
    if (isBrandNoise(brand)) continue;
    if (!isLikelyBrand(brand)) continue;
    if (brandLower === targetLower) continue;
    if (brandLower.startsWith(targetLower + " ")) continue;
    
    mentionedBrands.add(brand);
  }
  
  // Pattern 2 (fallback): Numbered list items that look like brand names
  // Only use if bold extraction found very few results
  if (mentionedBrands.size < 3) {
    const listPattern = /\d+\.\s*\*?\*?([A-Z][A-Za-z\s&'.()-]+?)(?:\*?\*?\s*[-–—:]|\s*\n)/g;
    while ((match = listPattern.exec(response)) !== null) {
      const brand = match[1].trim().replace(/\*+/g, "");
      const brandLower = brand.toLowerCase();
      
      if (isBrandNoise(brand)) continue;
      if (!isLikelyBrand(brand)) continue;
      if (brandLower === targetLower) continue;
      if (brandLower.startsWith(targetLower + " ")) continue;
      
      mentionedBrands.add(brand);
    }
  }
  
  return { mentionsBrand, mentionedBrands: Array.from(mentionedBrands) };
}

// Extract sentiment about a brand from response
function analyzeSentiment(response: string, brand: string): "positive" | "neutral" | "negative" | "not_mentioned" {
  const text = response.toLowerCase();
  const brandLower = brand.toLowerCase();
  
  if (!text.includes(brandLower)) return "not_mentioned";
  
  // Find sentences containing the brand
  const sentences = response.split(/[.!?]\s+/);
  const brandSentences = sentences.filter(s => s.toLowerCase().includes(brandLower));
  
  const positiveWords = ["excellent", "great", "best", "top", "recommended", "popular", "trusted", "quality", "effective", "innovative", "leading", "outstanding", "superior"];
  const negativeWords = ["poor", "weak", "lacking", "limited", "disappointing", "overpriced", "mediocre", "behind", "inferior"];
  
  let posCount = 0;
  let negCount = 0;
  
  for (const sentence of brandSentences) {
    const lower = sentence.toLowerCase();
    posCount += positiveWords.filter(w => lower.includes(w)).length;
    negCount += negativeWords.filter(w => lower.includes(w)).length;
  }
  
  if (posCount > negCount) return "positive";
  if (negCount > posCount) return "negative";
  return "neutral";
}

// Extract cited URLs from response
function extractCitations(response: string): string[] {
  const urlPattern = /https?:\/\/[^\s\)]+/g;
  const matches = response.match(urlPattern) || [];
  return [...new Set(matches)];
}

// System instruction that makes AI responses structured and brand-focused.
// This is the KEY to accurate brand extraction — we tell the AI exactly what format to use.
function getBrandExtractionSystemPrompt(category: string): string {
  return `You are a consumer research assistant. When answering questions about products or services, always:

1. Name specific BRANDS (company/product names) — never generic terms like "moisturizer", "platform", or ingredient names.
2. Format each brand mention in bold like **BrandName** so they are easy to identify.
3. Only mention brands that are actual companies/products in the ${category} category or closely related categories.
4. Do NOT bold section headings, tips, ingredients, product attributes, or instructions — only actual brand/company names.
5. Always respond in English.

Example good response for "best CRM software":
For small businesses, **HubSpot** offers a strong free tier. **Salesforce** dominates enterprise. **Pipedrive** is great for sales teams. **Zoho CRM** provides good value.

Example BAD response (don't do this):
**Strengths**: Good features. **Tip**: Start with free tier. **AI Features**: Built-in automation.`;
}

async function queryGemini(query: string, systemPrompt?: string): Promise<{ response: string }> {
  const client = new OpenAI();
  try {
    const response = await client.responses.create({
      model: "gemini_3_flash",
      instructions: systemPrompt || "Always respond in English.",
      input: query,
    });
    const text = typeof response.output === 'string' 
      ? response.output 
      : response.output_text || JSON.stringify(response.output);
    return { response: text };
  } catch (error: any) {
    console.error("Gemini query error:", error.message);
    return { response: "" };
  }
}

async function queryChatGPT(query: string, systemPrompt?: string): Promise<{ response: string }> {
  const client = new OpenAI();
  try {
    const response = await client.responses.create({
      model: "gpt5_nano",
      instructions: systemPrompt || "Always respond in English.",
      input: query,
    });
    const text = typeof response.output === 'string' 
      ? response.output 
      : response.output_text || JSON.stringify(response.output);
    return { response: text };
  } catch (error: any) {
    console.error("ChatGPT query error:", error.message);
    return { response: "" };
  }
}

async function queryClaude(query: string, systemPrompt?: string): Promise<{ response: string }> {
  const client = new Anthropic();
  try {
    const message = await client.messages.create({
      model: "claude_haiku_4_5",
      max_tokens: 1024,
      system: systemPrompt || "Always respond in English.",
      messages: [{ role: "user", content: query }],
    });
    const text = message.content.map((c: any) => c.type === "text" ? c.text : "").join("");
    return { response: text };
  } catch (error: any) {
    console.error("Claude query error:", error.message);
    return { response: "" };
  }
}

export function getEnginesForTier(tier: string): EngineConfig[] {
  const engines: EngineConfig[] = [
    { name: "ChatGPT", tier: "free", queryFn: queryChatGPT, model: "gpt5_nano" },
    { name: "Gemini", tier: "free", queryFn: queryGemini, model: "gemini_3_flash" },
    { name: "Claude", tier: "pro", queryFn: queryClaude, model: "claude_haiku_4_5" },
  ];
  
  // Updated tiers: Free (2 engines), Pro (3 engines), Enterprise (3 engines + more queries)
  const tierOrder = ["free", "pro", "enterprise"];
  const tierIndex = tierOrder.indexOf(tier);
  
  return engines.filter(e => tierOrder.indexOf(e.tier) <= tierIndex);
}

export async function queryEngine(
  engine: EngineConfig,
  query: string,
  targetBrand: string,
  category: string = "general"
): Promise<EngineResult> {
  // Pass a category-aware system prompt to get structured brand mentions
  const systemPrompt = getBrandExtractionSystemPrompt(category);
  const result = await engine.queryFn(query, systemPrompt);
  const { mentionsBrand, mentionedBrands } = extractBrands(result.response, targetBrand);
  const sentiment = analyzeSentiment(result.response, targetBrand);
  const citations = extractCitations(result.response);
  
  return {
    engine: engine.name,
    model: engine.model,
    query,
    response: result.response,
    mentionsBrand,
    mentionedBrands,
    sentiment,
    citations,
    timestamp: new Date().toISOString(),
  };
}

export type { EngineResult, EngineConfig };
