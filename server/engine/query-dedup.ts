// Gap 18: Within-run query deduplication
// When query templates expand {brand} and {category}, duplicates can emerge
// (e.g., "best {category} 2026" might match across different template slots).
// This deduplicates within a single audit run BEFORE sending to AI engines.

interface QueryWithIntent {
  query: string;
  intent: string;
}

/**
 * Deduplicate queries within a single audit run.
 * Uses normalized text comparison to catch near-duplicates.
 * Returns the deduplicated list (preserving first occurrence's intent).
 */
export function deduplicateQueries(queries: QueryWithIntent[]): QueryWithIntent[] {
  const seen = new Map<string, QueryWithIntent>();
  
  for (const q of queries) {
    const normalized = normalizeQuery(q.query);
    if (!seen.has(normalized)) {
      seen.set(normalized, q);
    }
  }
  
  return Array.from(seen.values());
}

/**
 * Normalize a query for dedup comparison:
 * - Lowercase
 * - Collapse whitespace
 * - Remove trailing punctuation
 * - Sort words (catches "brand vs competitor" == "competitor vs brand")
 */
function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/[?.!,;:]+$/g, "")   // strip trailing punctuation
    .replace(/\s+/g, " ")          // collapse whitespace
    // Don't sort words — "A vs B" and "B vs A" should both run since AI gives different answers
    ;
}

/**
 * Count how many queries were removed by dedup.
 * Useful for telemetry (Gap 16).
 */
export function getDedupeStats(
  original: QueryWithIntent[],
  deduped: QueryWithIntent[],
): { originalCount: number; dedupedCount: number; removedCount: number } {
  return {
    originalCount: original.length,
    dedupedCount: deduped.length,
    removedCount: original.length - deduped.length,
  };
}
