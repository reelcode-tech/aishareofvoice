// ASOV Versioning Constants
// Every audit stores these versions for reproducibility (Gap 7 + Gap 8)
// When scoring/extraction logic changes, bump the relevant version.
// This lets us compare apples-to-apples across audits and reprocess old data.

export const ASOV_VERSIONS = {
  // Bump when the 4D scoring weights or grade thresholds change
  scoringAlgorithm: "1.0.0",
  
  // Bump when brand extraction regex/logic changes (bold patterns, noise filters, etc.)
  brandExtraction: "1.0.0",
  
  // Bump when sentiment analysis keywords or logic changes
  sentimentAnalysis: "1.0.0",
  
  // Bump when GEO audit scoring weights or checks change
  geoAuditScoring: "1.0.0",
  
  // Bump when recommendation templates or priority logic changes
  recommendations: "1.0.0",
  
  // Bump when query templates are added/removed/reworded
  queryTemplates: "1.0.0",
  
  // Bump when competitor filtering or archetype thresholds change
  competitorAnalysis: "1.0.0",
  
  // Overall system version — bump on any breaking change
  system: "2.2.0",
} as const;

export type VersionSnapshot = typeof ASOV_VERSIONS;

/**
 * Build the version metadata block stored with each audit.
 * Includes engine models + tier query counts for full reproducibility.
 */
export function buildVersionMetadata(
  tier: string,
  engineModels: Record<string, string>,
  queryCount: number,
  engineCount: number,
  locale: string = "en",
  mode: "live" | "benchmark" = "live",
): AuditVersionMetadata {
  return {
    versions: { ...ASOV_VERSIONS },
    runtime: {
      tier,
      mode,
      locale,
      queryCount,
      engineCount,
      engineModels,
      timestamp: new Date().toISOString(),
      // Include Node/Workers runtime info for debugging
      runtime: typeof globalThis.navigator !== "undefined" ? "cloudflare-workers" : "node",
    },
  };
}

export interface AuditVersionMetadata {
  versions: VersionSnapshot;
  runtime: {
    tier: string;
    mode: "live" | "benchmark";
    locale: string;
    queryCount: number;
    engineCount: number;
    engineModels: Record<string, string>;
    timestamp: string;
    runtime: string;
  };
}
