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
  queryFn: (query: string) => Promise<{ response: string }>;
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
  
  // Extract numbered/bulleted brand mentions
  const brandPatterns = [
    /\d+\.\s*\*?\*?([A-Z][A-Za-z\s&'.()-]+?)(?:\*?\*?\s*[-–—:]|\s*\n)/g,
    /[-•]\s*\*?\*?([A-Z][A-Za-z\s&'.()-]+?)(?:\*?\*?\s*[-–—:]|\s*\n)/g,
    /\*\*([A-Z][A-Za-z\s&'.()-]+?)\*\*/g,
  ];
  
  const mentionedBrands = new Set<string>();
  for (const pattern of brandPatterns) {
    let match;
    while ((match = pattern.exec(response)) !== null) {
      const brand = match[1].trim().replace(/\*+/g, "");
      const brandLower = brand.toLowerCase();
      
      // Skip noise, target brand, and sub-brands of the target
      if (brand.length < 2 || brand.length > 40) continue;
      if (isBrandNoise(brand)) continue;
      if (brandLower === targetLower) continue;
      if (brandLower.startsWith(targetLower + " ")) continue; // e.g., "Saatva Classic" when target is "Saatva"
      
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

async function queryGemini(query: string): Promise<{ response: string }> {
  // Using OpenAI SDK with Gemini model through proxy
  const client = new OpenAI();
  try {
    const response = await client.responses.create({
      model: "gemini_3_flash",
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

async function queryChatGPT(query: string): Promise<{ response: string }> {
  const client = new OpenAI();
  try {
    const response = await client.responses.create({
      model: "gpt5_nano",
      instructions: "Always respond in English.",
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

async function queryClaude(query: string): Promise<{ response: string }> {
  const client = new Anthropic();
  try {
    const message = await client.messages.create({
      model: "claude_haiku_4_5",
      max_tokens: 1024,
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
  
  const tierOrder = ["free", "pro", "business", "enterprise"];
  const tierIndex = tierOrder.indexOf(tier);
  
  return engines.filter(e => tierOrder.indexOf(e.tier) <= tierIndex);
}

export async function queryEngine(
  engine: EngineConfig,
  query: string,
  targetBrand: string
): Promise<EngineResult> {
  const result = await engine.queryFn(query);
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
