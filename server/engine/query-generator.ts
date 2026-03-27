// Dynamic query generator — replaces static templates
// Uses a single cheap LLM call to produce tailored purchase-intent
// queries for ANY brand/category/competitor set.
// Provider priority: Claude (primary), then Gemini, then OpenAI as fallback
//
// Why dynamic:
// - Static templates can't capture niche industry queries
// - Competitor-specific comparison queries are impossible without knowing the competitors
// - Different brands in the same category have different buyer concerns
// - The queries ARE the measurement instrument — they need to be good

import { logger } from "./logger";

export interface GeneratedQuery {
  query: string;
  intent: "purchase" | "comparison" | "recommendation" | "research" | "alternative" | "branded";
}

// Query counts per tier — these are the REAL query counts, no cheating
// Higher tiers get 25 queries for higher statistical significance
const TIER_QUERY_COUNTS: Record<string, number> = {
  snapshot: 12,
  monitor: 25,
  agency: 25,
};

/**
 * Multi-provider LLM call for query generation.
 * Tries Claude → Gemini → OpenAI in priority order.
 * Returns the raw text response or null if all fail.
 */
async function callQueryGenLLM(prompt: string): Promise<string | null> {
  const systemMsg = "You are a consumer research analyst. Return ONLY valid JSON. No markdown, no code fences, no explanation.";

  // 1. Try Claude (cheapest, most reliable currently)
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: 2048,
          system: systemMsg,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (r.ok) {
        const data = await r.json() as any;
        const text = data.content?.map((c: any) => c.type === "text" ? c.text : "").join("") || "";
        if (text.length > 20) {
          logger.info("query_gen_provider", { provider: "claude" });
          return text;
        }
      } else {
        const err = await r.text();
        logger.warn("query_gen_claude_fail", { status: r.status, error: err.slice(0, 100) });
      }
    } catch (e: any) { logger.warn("query_gen_claude_error", { error: e.message }); }
  }

  // 2. Try Gemini
  const geminiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemMsg }] },
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 2048, temperature: 0.7 },
          }),
        }
      );
      if (r.ok) {
        const data = await r.json() as any;
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (text.length > 20) {
          logger.info("query_gen_provider", { provider: "gemini" });
          return text;
        }
      } else {
        const err = await r.text();
        logger.warn("query_gen_gemini_fail", { status: r.status, error: err.slice(0, 100) });
      }
    } catch (e: any) { logger.warn("query_gen_gemini_error", { error: e.message }); }
  }

  // 3. Try OpenAI
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemMsg },
            { role: "user", content: prompt },
          ],
          max_tokens: 2048,
          temperature: 0.7,
        }),
      });
      if (r.ok) {
        const data = await r.json() as any;
        const text = data.choices?.[0]?.message?.content || "";
        if (text.length > 20) {
          logger.info("query_gen_provider", { provider: "openai" });
          return text;
        }
      } else {
        const err = await r.text();
        logger.warn("query_gen_openai_fail", { status: r.status, error: err.slice(0, 100) });
      }
    } catch (e: any) { logger.warn("query_gen_openai_error", { error: e.message }); }
  }

  return null;
}

/**
 * Generate tailored queries for a brand using LLM.
 * Falls back to a basic set if all LLM providers fail.
 */
export async function generateQueries(
  brandName: string,
  category: string,
  competitors: string[],
  tier: "snapshot" | "monitor" | "agency",
  locale: string = "en",
): Promise<GeneratedQuery[]> {
  const queryCount = TIER_QUERY_COUNTS[tier] || 12;
  const competitorList = competitors.length > 0
    ? competitors.slice(0, 8).join(", ")
    : "unknown (discover from AI responses)";

  const prompt = buildPrompt(brandName, category, competitorList, queryCount, locale);

  try {
    // Try Claude first (primary), then Gemini, then OpenAI as fallback
    const text = await callQueryGenLLM(prompt);
    if (!text) {
      logger.warn("query_gen_all_providers_failed", { brand: brandName });
      return buildFallbackQueries(brandName, category, competitors, queryCount, locale);
    }

    const queries = parseQueryResponse(text, brandName, queryCount);

    if (queries.length >= Math.floor(queryCount * 0.7)) {
      logger.info("query_gen_success", { brand: brandName, count: queries.length, tier });
      return queries.slice(0, queryCount);
    }

    // Didn't get enough queries — supplement with fallback
    logger.warn("query_gen_partial", { brand: brandName, got: queries.length, needed: queryCount });
    const fallback = buildFallbackQueries(brandName, category, competitors, queryCount, locale);
    const combined = deduplicateByText([...queries, ...fallback]);
    return combined.slice(0, queryCount);

  } catch (error: any) {
    logger.error("query_gen_error", { error: error.message });
    return buildFallbackQueries(brandName, category, competitors, queryCount, locale);
  }
}

function buildPrompt(
  brandName: string,
  category: string,
  competitorList: string,
  queryCount: number,
  locale: string,
): string {
  const langInstruction = locale !== "en"
    ? `Write all queries in the native language for locale "${locale}". Do NOT translate from English — write queries the way a native speaker would actually search.`
    : "Write all queries in English.";

  return `Generate exactly ${queryCount} search queries that real consumers would type into an AI assistant (ChatGPT, Gemini, Claude, Perplexity) when researching "${brandName}" or its category "${category}".

Brand: ${brandName}
Category: ${category}
Known competitors: ${competitorList}

${langInstruction}

Requirements:
1. Queries must reflect REAL purchase-intent search behavior — how people actually ask AI for buying advice
2. Mix these intent types across the ${queryCount} queries:
   - "purchase" — ready to buy, looking for specific product recommendations (e.g., "best ${category} under $200")
   - "comparison" — comparing ${brandName} directly against specific competitors (e.g., "${brandName} vs [competitor] which is better for [use case]")
   - "recommendation" — open-ended category browsing (e.g., "top ${category} brands 2026")
   - "research" — evaluating ${brandName} specifically (e.g., "${brandName} quality issues", "is ${brandName} worth it")
   - "alternative" — looking for substitutes (e.g., "cheaper alternatives to ${brandName}")
   - "branded" — direct brand queries (e.g., "${brandName} reviews 2026")

3. Include at least 2 direct head-to-head comparison queries naming specific competitors from the list
4. Include queries specific to the ${category} industry — use real terminology, not generic phrases
5. Vary the specificity: some broad ("best ${category}"), some very specific ("best ${category} for [specific use case]")
6. Do NOT include duplicate or near-duplicate queries

Return a JSON array of objects with "query" (string) and "intent" (one of: purchase, comparison, recommendation, research, alternative, branded).

Example format:
[{"query":"best CRM for startups under 20 employees","intent":"purchase"},{"query":"HubSpot vs Salesforce for small business 2026","intent":"comparison"}]`;
}

/**
 * Parse the LLM response into structured queries.
 * Handles various response formats (raw JSON, markdown-wrapped, etc.)
 */
function parseQueryResponse(text: string, brandName: string, expectedCount: number): GeneratedQuery[] {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];

    const validIntents = new Set(["purchase", "comparison", "recommendation", "research", "alternative", "branded"]);

    return parsed
      .filter((item: any) => {
        if (!item.query || typeof item.query !== "string") return false;
        if (item.query.length < 5 || item.query.length > 200) return false;
        return true;
      })
      .map((item: any) => ({
        query: item.query.trim(),
        intent: validIntents.has(item.intent) ? item.intent : "recommendation",
      }));
  } catch {
    // Try to extract queries line by line if JSON parse fails
    const lines = cleaned.split("\n").filter(l => l.trim().length > 10);
    return lines.slice(0, expectedCount).map(line => ({
      query: line.replace(/^[\d.\-•*]+\s*/, "").replace(/["{}[\]]/g, "").trim(),
      intent: "recommendation" as const,
    }));
  }
}

/**
 * Fallback queries when the LLM call fails.
 * Uses the brand name, category, and competitors to build reasonable queries.
 * Better than the old static templates because it uses actual competitor names.
 */
function buildFallbackQueries(
  brandName: string,
  category: string,
  competitors: string[],
  count: number,
  locale: string,
): GeneratedQuery[] {
  const queries: GeneratedQuery[] = [];

  // Core branded queries
  queries.push({ query: `${brandName} review`, intent: "branded" });
  queries.push({ query: `is ${brandName} worth it 2026`, intent: "research" });
  queries.push({ query: `alternatives to ${brandName}`, intent: "alternative" });
  queries.push({ query: `${brandName} pros and cons`, intent: "research" });

  // Category queries
  queries.push({ query: `best ${category} 2026`, intent: "recommendation" });
  queries.push({ query: `top ${category} brands`, intent: "recommendation" });
  queries.push({ query: `best ${category} for the money`, intent: "purchase" });
  queries.push({ query: `${category} buying guide 2026`, intent: "research" });

  // Competitor comparison queries (using REAL competitor names)
  if (competitors.length > 0) {
    queries.push({ query: `${brandName} vs ${competitors[0]} which is better`, intent: "comparison" });
  }
  if (competitors.length > 1) {
    queries.push({ query: `${brandName} vs ${competitors[1]} comparison 2026`, intent: "comparison" });
  }
  if (competitors.length > 2) {
    queries.push({ query: `${competitors[0]} vs ${competitors[2]} vs ${brandName}`, intent: "comparison" });
  }

  // More category queries for higher tiers
  queries.push({ query: `affordable ${category} recommendations`, intent: "purchase" });
  queries.push({ query: `best premium ${category}`, intent: "recommendation" });
  queries.push({ query: `most popular ${category} brands 2026`, intent: "recommendation" });
  queries.push({ query: `${brandName} customer satisfaction`, intent: "research" });
  queries.push({ query: `best ${category} for beginners`, intent: "recommendation" });
  queries.push({ query: `${brandName} compared to competitors`, intent: "comparison" });
  queries.push({ query: `which ${category} brand has the best reputation`, intent: "research" });
  queries.push({ query: `best ${category} under $100`, intent: "purchase" });
  queries.push({ query: `${category} brands with best customer reviews`, intent: "recommendation" });

  // More competitor comparisons for Agency tier
  for (let i = 0; i < Math.min(competitors.length, 5); i++) {
    queries.push({ query: `${brandName} vs ${competitors[i]} detailed comparison`, intent: "comparison" });
  }

  queries.push({ query: `best sustainable ${category} brands`, intent: "recommendation" });
  queries.push({ query: `${brandName} long-term reliability`, intent: "research" });
  queries.push({ query: `fastest growing ${category} brands 2026`, intent: "recommendation" });
  queries.push({ query: `best ${category} for professionals`, intent: "purchase" });
  queries.push({ query: `${brandName} market position 2026`, intent: "research" });

  return deduplicateByText(queries).slice(0, count);
}

function deduplicateByText(queries: GeneratedQuery[]): GeneratedQuery[] {
  const seen = new Set<string>();
  return queries.filter(q => {
    const key = q.query.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
