// Multi-engine AI query layer — Production version
// Uses direct API calls to each provider with explicit API keys
// Snapshot: ChatGPT + Gemini (2 engines, cheapest)
// Monitor: + Claude (3 engines)
// Agency: + Grok + Perplexity (5 engines)

import { getCached, setCached } from "./cache";
import { recordFailure, recordSuccess, shouldSkipProvider } from "./circuit-breaker";
import { recordSpend } from "./spend-tracker";
import { logger } from "./logger";

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
  tier: "snapshot" | "monitor" | "agency";
  queryFn: (query: string, systemPrompt?: string, tier?: string) => Promise<{ response: string }>;
  model: string;
}

// ── Brand noise filtering (unchanged from original) ─────────────────

const BRAND_NOISE_PATTERNS = new Set([
  "best overall", "best for", "best value", "best budget", "best premium",
  "best luxury", "best selling", "runner up", "runner-up", "runners up",
  "honorable mention", "editor's choice", "editor pick", "editors pick",
  "our pick", "top pick", "top choice", "our top", "our favorite",
  "most popular", "most affordable", "most comfortable", "most durable",
  "key features", "pros and cons", "pros", "cons", "features",
  "firmness", "firmness level", "zoned support", "lumbar support",
  "memory foam", "hybrid mattress", "pillow top", "coil count",
  "sleep trial", "warranty", "free shipping", "price range",
  "trial and warranty", "trial period", "cooling", "feel", "type",
  "shipping", "price", "budget", "value", "construction",
  "motion isolation", "edge support", "durability", "comfort",
  "things to consider", "what to look for", "how to choose",
  "final thoughts", "the bottom line", "in conclusion", "summary",
  "important note", "disclaimer", "frequently asked", "faq",
  "the verdict", "performance metrics", "phase",
  "kelebihan", "kekurangan", "catatan praktis", "keunikan",
  "cocok untuk", "tipe utama", "rasanya", "varian utama",
  "pertimbangkan hal", "apa itu", "harga relatif",
  "pilihan kekerasan", "dukungan dan daya tahan",
  "why worth it", "why consider", "what to know", "price vibe",
  "how you sleep", "best for side sleepers", "best for back sleepers",
  "best for back pain", "best for cooling", "best for pressure relief",
  "best for heavy people", "best for stomach sleepers",
  "best for side sleepers", "best for couples",
  "best for hot sleepers", "best all",
  "prorated", "non-prorated", "tech",
]);

const DESCRIPTOR_STARTS = [
  "best ", "top ", "most ", "our ", "the best", "a great", "an excellent",
  "highly ", "overall ", "also ", "another ", "other ",
  "here are", "here is", "there are", "these ", "those ",
  "some ", "many ", "several ", "various ", "different ",
  "how to", "what to", "when to", "why ", "where to",
];

function isBrandNoise(candidate: string): boolean {
  const lower = candidate.toLowerCase().trim();
  if (BRAND_NOISE_PATTERNS.has(lower)) return true;
  for (const prefix of DESCRIPTOR_STARTS) {
    if (lower.startsWith(prefix)) return true;
  }
  if (candidate === candidate.toLowerCase() && candidate.length > 3) return true;
  if (candidate.split(/\s+/).length > 4) return true;
  const genericWords = new Set(["premium", "luxury", "budget", "affordable", "comfortable", "firm", "soft", "medium", "organic", "natural", "hybrid", "classic", "original", "standard", "basic", "advanced", "professional", "ultimate", "elite", "signature"]);
  const words = lower.split(/\s+/);
  if (words.every(w => genericWords.has(w))) return true;
  const productSuffixes = [" mattress", " pillow", " topper", " sheet", " base", " frame", " foundation", " protector", " sleepers", " sleeper", " people", " options", " position", " preferences"];
  for (const suffix of productSuffixes) {
    if (lower.endsWith(suffix)) return true;
  }
  if (words.length === 1) {
    const commonWords = new Set(["cooling", "feel", "type", "shipping", "price", "budget", "value",
      "warranty", "trial", "pros", "cons", "features", "construction", "materials",
      "summary", "durability", "comfort", "support", "motion", "transfer", "delivery",
      "returns", "comparison", "rating", "review", "score", "verdict", "conclusion",
      "latex", "foam", "hybrid", "coils", "springs", "layers", "cover",
      "excellent", "superior", "average", "high", "low", "moderate",
      "certifications", "certification", "materials", "ingredients", "specifications",
      "temperature", "breathability", "firmness", "density",
      "kelebihan", "kekurangan", "keunikan", "rasanya", "cocok",
    ]);
    if (commonWords.has(lower)) return true;
  }
  return false;
}

function isLikelyBrand(candidate: string): boolean {
  const lower = candidate.toLowerCase().trim();
  if (candidate.length < 2 || candidate.length > 35) return false;
  if (candidate.split(/\s+/).length > 4) return false;
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
  const ingredientNoiseWords = new Set([
    "ceramides", "niacinamide", "retinol", "hyaluronic acid", "salicylic acid",
    "vitamin c", "vitamin e", "bakuchiol", "peptides", "collagen", "spf",
    "memory foam", "latex", "hybrid", "innerspring", "coils",
    "fragrance", "organic", "vegan", "cruelty",
  ]);
  if (ingredientNoiseWords.has(lower)) return false;
  return true;
}

// ── Brand extraction & analysis (unchanged) ─────────────────────────

function extractBrands(response: string, targetBrand: string): {
  mentionsBrand: boolean;
  mentionedBrands: string[];
} {
  const text = response.toLowerCase();
  const targetLower = targetBrand.toLowerCase();
  
  const mentionsBrand = text.includes(targetLower) || 
    text.includes(targetLower.replace(/['']/g, "")) ||
    text.includes(targetLower.replace(/\s+/g, ""));
  
  const mentionedBrands = new Set<string>();
  
  const boldPattern = /\*\*([A-Z][A-Za-z\s&'.()\/\-]+?)\*\*/g;
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
  
  if (mentionedBrands.size < 3) {
    const listPattern = /\d+\.\s*\*?\*?([A-Z][A-Za-z\s&'.()\/\-]+?)(?:\*?\*?\s*[\-–—:]|\s*\n)/g;
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

function analyzeSentiment(response: string, brand: string): "positive" | "neutral" | "negative" | "not_mentioned" {
  const text = response.toLowerCase();
  const brandLower = brand.toLowerCase();
  if (!text.includes(brandLower)) return "not_mentioned";
  
  const sentences = response.split(/[.!?]\s+/);
  const brandSentences = sentences.filter(s => s.toLowerCase().includes(brandLower));
  
  const positiveWords = ["excellent", "great", "best", "top", "recommended", "popular", "trusted", "quality", "effective", "innovative", "leading", "outstanding", "superior"];
  const negativeWords = ["poor", "weak", "lacking", "limited", "disappointing", "overpriced", "mediocre", "behind", "inferior"];
  
  let posCount = 0, negCount = 0;
  for (const sentence of brandSentences) {
    const lower = sentence.toLowerCase();
    posCount += positiveWords.filter(w => lower.includes(w)).length;
    negCount += negativeWords.filter(w => lower.includes(w)).length;
  }
  
  if (posCount > negCount) return "positive";
  if (negCount > posCount) return "negative";
  return "neutral";
}

function extractCitations(response: string): string[] {
  const urlPattern = /https?:\/\/[^\s\)]+/g;
  const matches = response.match(urlPattern) || [];
  return [...new Set(matches)];
}

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

// ── Provider-specific API clients ───────────────────────────────────

// Per-provider timeout budgets (milliseconds) per v3 spec §3
const PROVIDER_TIMEOUTS: Record<string, number> = {
  openai: 10_000,
  gemini: 12_000,
  anthropic: 15_000,
  grok: 12_000,
  perplexity: 20_000,
};

// Helper: fetch with timeout using AbortController
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Helper: call OpenAI-compatible chat completions API
async function callOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  query: string,
  systemPrompt?: string,
  timeoutMs: number = 10_000
): Promise<string> {
  const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        { role: "user", content: query },
      ],
      max_tokens: 1024,
    }),
  }, timeoutMs);
  
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`${model} API error ${response.status}: ${err.slice(0, 200)}`);
  }
  
  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content || "";
}

// Helper: call Anthropic Messages API
async function callAnthropic(
  apiKey: string,
  model: string,
  query: string,
  systemPrompt?: string,
  timeoutMs: number = 15_000
): Promise<string> {
  const response = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: [{ role: "user", content: query }],
    }),
  }, timeoutMs);
  
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err.slice(0, 200)}`);
  }
  
  const data = await response.json() as any;
  return data.content?.map((c: any) => c.type === "text" ? c.text : "").join("") || "";
}

// Helper: call Google Gemini API
async function callGemini(
  apiKey: string,
  model: string,
  query: string,
  systemPrompt?: string,
  timeoutMs: number = 12_000
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const contents: any[] = [];
  
  if (systemPrompt) {
    // Gemini uses system_instruction field
  }
  
  contents.push({ role: "user", parts: [{ text: query }] });
  
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(systemPrompt ? { system_instruction: { parts: [{ text: systemPrompt }] } } : {}),
      contents,
      generationConfig: { maxOutputTokens: 1024 },
    }),
  }, timeoutMs);
  
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err.slice(0, 200)}`);
  }
  
  const data = await response.json() as any;
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// ── Engine query functions (async cache + direct API) ───────────────

async function queryGeminiEngine(query: string, systemPrompt?: string, tier?: string): Promise<{ response: string }> {
  const cached = await getCached("gemini", query, tier);
  if (cached) { logger.cache("hit", { engine: "gemini", tier }); return { response: cached }; }
  
  // Circuit breaker check
  const skip = await shouldSkipProvider("gemini");
  if (skip.skip) { logger.provider("skipped", { provider: "gemini", reason: skip.reason }); return { response: "" }; }
  
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) { logger.warn("no_api_key", { provider: "gemini" }); return { response: "" }; }
  
  const start = Date.now();
  try {
    const text = await callGemini(apiKey, "gemini-2.0-flash", query, systemPrompt, PROVIDER_TIMEOUTS.gemini);
    await setCached("gemini", query, text, tier);
    await recordSuccess("gemini");
    await recordSpend("gemini");
    logger.provider("success", { provider: "gemini", model: "gemini-2.0-flash", durationMs: Date.now() - start });
    return { response: text };
  } catch (error: any) {
    await recordFailure("gemini");
    logger.provider("error", { provider: "gemini", error: error.message, durationMs: Date.now() - start });
    return { response: "" };
  }
}

async function queryChatGPTEngine(query: string, systemPrompt?: string, tier?: string): Promise<{ response: string }> {
  const cached = await getCached("chatgpt", query, tier);
  if (cached) { logger.cache("hit", { engine: "chatgpt", tier }); return { response: cached }; }
  
  const skip = await shouldSkipProvider("chatgpt");
  if (skip.skip) { logger.provider("skipped", { provider: "chatgpt", reason: skip.reason }); return { response: "" }; }
  
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { logger.warn("no_api_key", { provider: "chatgpt" }); return { response: "" }; }
  
  const start = Date.now();
  try {
    const text = await callOpenAICompatible(
      "https://api.openai.com/v1", apiKey, "gpt-4o-mini", query, systemPrompt, PROVIDER_TIMEOUTS.openai
    );
    await setCached("chatgpt", query, text, tier);
    await recordSuccess("chatgpt");
    await recordSpend("chatgpt");
    logger.provider("success", { provider: "chatgpt", model: "gpt-4o-mini", durationMs: Date.now() - start });
    return { response: text };
  } catch (error: any) {
    await recordFailure("chatgpt");
    logger.provider("error", { provider: "chatgpt", error: error.message, durationMs: Date.now() - start });
    return { response: "" };
  }
}

async function queryClaudeEngine(query: string, systemPrompt?: string, tier?: string): Promise<{ response: string }> {
  const cached = await getCached("claude", query, tier);
  if (cached) { logger.cache("hit", { engine: "claude", tier }); return { response: cached }; }
  
  const skip = await shouldSkipProvider("claude");
  if (skip.skip) { logger.provider("skipped", { provider: "claude", reason: skip.reason }); return { response: "" }; }
  
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { logger.warn("no_api_key", { provider: "claude" }); return { response: "" }; }
  
  const start = Date.now();
  try {
    const text = await callAnthropic(apiKey, "claude-3-5-haiku-20241022", query, systemPrompt, PROVIDER_TIMEOUTS.anthropic);
    await setCached("claude", query, text, tier);
    await recordSuccess("claude");
    await recordSpend("claude");
    logger.provider("success", { provider: "claude", model: "claude-3-5-haiku", durationMs: Date.now() - start });
    return { response: text };
  } catch (error: any) {
    await recordFailure("claude");
    logger.provider("error", { provider: "claude", error: error.message, durationMs: Date.now() - start });
    return { response: "" };
  }
}

async function queryGrokEngine(query: string, systemPrompt?: string, tier?: string): Promise<{ response: string }> {
  const cached = await getCached("grok", query, tier);
  if (cached) { logger.cache("hit", { engine: "grok", tier }); return { response: cached }; }
  
  const skip = await shouldSkipProvider("grok");
  if (skip.skip) { logger.provider("skipped", { provider: "grok", reason: skip.reason }); return { response: "" }; }
  
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) { logger.warn("no_api_key", { provider: "grok" }); return { response: "" }; }
  
  const start = Date.now();
  try {
    const text = await callOpenAICompatible(
      "https://api.x.ai/v1", apiKey, "grok-3-mini-fast", query, systemPrompt, PROVIDER_TIMEOUTS.grok
    );
    await setCached("grok", query, text, tier);
    await recordSuccess("grok");
    await recordSpend("grok");
    logger.provider("success", { provider: "grok", model: "grok-3-mini-fast", durationMs: Date.now() - start });
    return { response: text };
  } catch (error: any) {
    await recordFailure("grok");
    logger.provider("error", { provider: "grok", error: error.message, durationMs: Date.now() - start });
    return { response: "" };
  }
}

async function queryPerplexityEngine(query: string, systemPrompt?: string, tier?: string): Promise<{ response: string }> {
  const cached = await getCached("perplexity", query, tier);
  if (cached) { logger.cache("hit", { engine: "perplexity", tier }); return { response: cached }; }
  
  const skip = await shouldSkipProvider("perplexity");
  if (skip.skip) { logger.provider("skipped", { provider: "perplexity", reason: skip.reason }); return { response: "" }; }
  
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) { logger.warn("no_api_key", { provider: "perplexity" }); return { response: "" }; }
  
  const start = Date.now();
  try {
    const text = await callOpenAICompatible(
      "https://api.perplexity.ai", apiKey, "sonar", query, systemPrompt, PROVIDER_TIMEOUTS.perplexity
    );
    await setCached("perplexity", query, text, tier);
    await recordSuccess("perplexity");
    await recordSpend("perplexity");
    logger.provider("success", { provider: "perplexity", model: "sonar", durationMs: Date.now() - start });
    return { response: text };
  } catch (error: any) {
    await recordFailure("perplexity");
    logger.provider("error", { provider: "perplexity", error: error.message, durationMs: Date.now() - start });
    return { response: "" };
  }
}

// ── Engine registry ─────────────────────────────────────────────────

export function getEnginesForTier(tier: string): EngineConfig[] {
  const engines: EngineConfig[] = [
    { name: "ChatGPT", tier: "snapshot", queryFn: queryChatGPTEngine, model: "gpt-4o-mini" },
    { name: "Gemini", tier: "snapshot", queryFn: queryGeminiEngine, model: "gemini-2.0-flash" },
    { name: "Claude", tier: "monitor", queryFn: queryClaudeEngine, model: "claude-3-5-haiku" },
    { name: "Grok", tier: "agency", queryFn: queryGrokEngine, model: "grok-3-mini-fast" },
    { name: "Perplexity", tier: "agency", queryFn: queryPerplexityEngine, model: "sonar" },
  ];
  
  const tierOrder = ["snapshot", "monitor", "agency"];
  const legacyMap: Record<string, string> = { "free": "snapshot", "pro": "monitor", "enterprise": "agency" };
  const normalizedTier = legacyMap[tier] || tier;
  const tierIndex = tierOrder.indexOf(normalizedTier);
  
  return engines.filter(e => tierOrder.indexOf(e.tier) <= tierIndex);
}

// ── Concurrency-controlled batch execution ──────────────────────────

const MAX_CONCURRENT = 8;

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  maxConcurrent: number = MAX_CONCURRENT
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    while (nextIndex < tasks.length) {
      const index = nextIndex++;
      results[index] = await tasks[index]();
    }
  }

  const workers = Array.from(
    { length: Math.min(maxConcurrent, tasks.length) },
    () => runNext()
  );
  await Promise.all(workers);
  return results;
}

export async function queryEnginesBatch(
  engines: EngineConfig[],
  queries: { query: string; intent: string }[],
  targetBrand: string,
  category: string = "general",
  tier: string = "snapshot"
): Promise<EngineResult[]> {
  const systemPrompt = getBrandExtractionSystemPrompt(category);
  
  const tasks = engines.flatMap(engine =>
    queries.map(q => async (): Promise<EngineResult> => {
      const result = await engine.queryFn(q.query, systemPrompt, tier);
      const { mentionsBrand, mentionedBrands } = extractBrands(result.response, targetBrand);
      const sentiment = analyzeSentiment(result.response, targetBrand);
      const citations = extractCitations(result.response);
      
      return {
        engine: engine.name,
        model: engine.model,
        query: q.query,
        response: result.response,
        mentionsBrand,
        mentionedBrands,
        sentiment,
        citations,
        timestamp: new Date().toISOString(),
      };
    })
  );
  
  console.log(`[Engines] Running ${tasks.length} queries with max ${MAX_CONCURRENT} concurrent...`);
  const startTime = Date.now();
  const results = await runWithConcurrency(tasks);
  console.log(`[Engines] Completed ${tasks.length} queries in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  
  return results;
}

export async function queryEngine(
  engine: EngineConfig,
  query: string,
  targetBrand: string,
  category: string = "general",
  tier: string = "snapshot"
): Promise<EngineResult> {
  const systemPrompt = getBrandExtractionSystemPrompt(category);
  const result = await engine.queryFn(query, systemPrompt, tier);
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
