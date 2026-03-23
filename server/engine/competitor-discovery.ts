/**
 * Lightweight competitor discovery using AI.
 * Called BEFORE the full audit so users can preview and edit the competitor set.
 * 
 * Uses a single fast AI call to identify likely competitors for a brand+category.
 * Much cheaper/faster than running the full audit pipeline.
 */

import OpenAI from "openai";

/**
 * Ask AI to identify the top competitors for a brand in a given category.
 * Returns an array of competitor brand names (typically 5-8).
 */
export async function discoverCompetitors(
  brandName: string,
  category: string,
  url?: string
): Promise<string[]> {
  const client = new OpenAI();

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

  try {
    const response = await client.responses.create({
      model: "gpt5_nano",
      instructions: "You are a market research analyst. Return only brand names, one per line. No numbering, no explanations.",
      input: prompt,
    });

    const text = typeof response.output === "string"
      ? response.output
      : response.output_text || "";

    // Parse response: one brand per line, filter out empty lines and noise
    const competitors = text
      .split("\n")
      .map((line: string) => line.replace(/^\d+[\.\)]\s*/, "").replace(/^[-•*]\s*/, "").trim())
      .filter((line: string) => {
        if (!line) return false;
        if (line.length < 2 || line.length > 40) return false;
        if (line.toLowerCase() === brandName.toLowerCase()) return false;
        // Skip lines that look like explanations
        if (line.includes(":") && line.length > 30) return false;
        if (line.startsWith("Note") || line.startsWith("These") || line.startsWith("The ")) return false;
        return true;
      })
      .slice(0, 8);

    return competitors;
  } catch (error: any) {
    console.error("[Discover] AI call failed:", error.message);
    // Return empty list — the user can still manually add competitors
    return [];
  }
}
