/**
 * Lightweight competitor discovery using AI.
 * Called BEFORE the full audit so users can preview and edit the competitor set.
 * 
 * Multi-provider: tries Claude → OpenAI → Gemini.
 * Direct fetch — no SDK — to avoid Workers `cache` field incompatibility.
 */

import { logger } from "./logger";

/**
 * Ask AI to identify the top competitors for a brand in a given category.
 * Returns an array of competitor brand names (typically 5-8).
 */
export async function discoverCompetitors(
  brandName: string,
  category: string,
  url?: string
): Promise<string[]> {
  const systemMsg = "You are a market research analyst. Return only brand names, one per line. No numbering, no explanations.";
  const prompt = `You are a market research analyst. For the brand "${brandName}" in the "${category}" category${url ? ` (website: ${url})` : ""}, list the top 8 direct competitors.

Rules:
- Only list real companies/brands that compete in the same "${category}" category
- Each competitor must be a brand name, not a generic term or product type
- Order by market relevance (most direct competitor first)
- Do NOT include "${brandName}" itself
- Do NOT include brands from unrelated categories (e.g., no tech brands for skincare, no skincare for CRM)
- Return ONLY the brand names, one per line, no numbering, no explanations, no extra text

Example output for "CeraVe" in "skincare":
La Roche-Posay
Cetaphil
Neutrogena
The Ordinary
Vanicream
Eucerin
Paula's Choice
Aveeno`;

  let text = "";

  // 1. Try Claude (primary)
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey && !text) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-5-haiku-latest",
          max_tokens: 256,
          system: systemMsg,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (r.ok) {
        const data = await r.json() as any;
        text = data.content?.map((c: any) => c.type === "text" ? c.text : "").join("") || "";
        if (text.length > 5) logger.info("discover_provider", { provider: "claude" });
        else text = "";
      } else {
        const err = await r.text();
        logger.warn("discover_claude_fail", { status: r.status, error: err.slice(0, 100) });
      }
    } catch (e: any) { logger.warn("discover_claude_error", { error: e.message }); }
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
          max_tokens: 256,
          temperature: 0.3,
        }),
      });
      if (r.ok) {
        const data = await r.json() as any;
        text = data.choices?.[0]?.message?.content || "";
        if (text.length > 5) logger.info("discover_provider", { provider: "openai" });
        else text = "";
      } else {
        const err = await r.text();
        logger.warn("discover_openai_fail", { status: r.status, error: err.slice(0, 100) });
      }
    } catch (e: any) { logger.warn("discover_openai_error", { error: e.message }); }
  }

  // 3. Try Gemini
  const geminiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (geminiKey && !text) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemMsg }] },
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 256 },
          }),
        }
      );
      if (r.ok) {
        const data = await r.json() as any;
        text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (text.length > 5) logger.info("discover_provider", { provider: "gemini" });
        else text = "";
      } else {
        const err = await r.text();
        logger.warn("discover_gemini_fail", { status: r.status, error: err.slice(0, 100) });
      }
    } catch (e: any) { logger.warn("discover_gemini_error", { error: e.message }); }
  }

  if (!text) {
    logger.warn("discover_all_failed", { brand: brandName });
    return [];
  }

  // Parse response: one brand per line, filter out empty lines and noise
  const competitors = text
    .split("\n")
    .map((line: string) => line.replace(/^\d+[\.)\]]\s*/, "").replace(/^[-•*]\s*/, "").trim())
    .filter((line: string) => {
      if (!line) return false;
      if (line.length < 2 || line.length > 40) return false;
      if (line.toLowerCase() === brandName.toLowerCase()) return false;
      if (line.includes(":") && line.length > 30) return false;
      if (line.startsWith("Note") || line.startsWith("These") || line.startsWith("The ")) return false;
      return true;
    })
    .slice(0, 8);

  logger.info("discover_success", { brand: brandName, competitors: competitors.length });
  return competitors;
}
