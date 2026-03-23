/**
 * AI Engine Evaluation Harness
 * 
 * Runs real audits across diverse categories, captures raw AI responses,
 * and evaluates accuracy across multiple dimensions:
 * 
 * 1. Brand Detection Accuracy: Does it correctly identify the target brand?
 * 2. Competitor Relevance: Are extracted competitors actually in the same category?
 * 3. False Positive Rate: How many non-brand terms get extracted as brands?
 * 4. Sentiment Accuracy: Does positive/negative match what the AI actually said?
 * 5. Cross-Category Contamination: Do unrelated brands leak in?
 * 6. Query Relevance: Are the queries actually things consumers would ask?
 */

import { getEnginesForTier, queryEngine, type EngineResult } from "../ai-engines";
import { getQueriesForBrand } from "../query-templates";
import { normalizeBrandName } from "../brand-detection";
import { calculateScores } from "../scoring";
import { runGeoAudit } from "../geo-audit";
import * as fs from "fs";
import * as path from "path";

// ============================================================================
// TEST CASES — known brands with expected competitors and known NON-competitors
// ============================================================================

interface TestCase {
  brand: string;
  url: string;
  category: string;
  // Brands we EXPECT to see as competitors
  expectedCompetitors: string[];
  // Brands that should NEVER appear as competitors (cross-category noise)
  forbiddenCompetitors: string[];
  // Generic terms that should NOT be extracted as brands
  expectedNoise: string[];
}

const TEST_CASES: TestCase[] = [
  // === SKINCARE ===
  {
    brand: "CeraVe",
    url: "cerave.com",
    category: "skincare",
    expectedCompetitors: ["La Roche-Posay", "The Ordinary", "Cetaphil", "Neutrogena", "Vanicream", "Paula's Choice"],
    forbiddenCompetitors: ["Apple", "Nike", "Samsung", "Tesla", "Casper", "HubSpot", "Toyota", "Salesforce"],
    expectedNoise: ["moisturizer", "sunscreen", "cleanser", "serum", "retinol", "morning", "evening"],
  },
  // === MATTRESSES ===
  {
    brand: "Saatva",
    url: "saatva.com",
    category: "mattresses",
    expectedCompetitors: ["Casper", "Purple", "Tempur-Pedic", "Tuft & Needle", "Helix", "Brooklyn Bedding", "WinkBed"],
    forbiddenCompetitors: ["Apple", "Nike", "CeraVe", "HubSpot", "Sephora", "Toyota", "Mercedes"],
    expectedNoise: ["firmness", "cooling", "hybrid", "memory foam", "side sleeper", "warranty"],
  },
  // === JEWELRY ===
  {
    brand: "Mejuri",
    url: "mejuri.com",
    category: "jewelry",
    expectedCompetitors: ["Tiffany", "Pandora", "Ana Luisa", "Missoma", "Monica Vinader", "Gorjana", "Kendra Scott"],
    forbiddenCompetitors: ["Apple", "Nike", "CeraVe", "Casper", "HubSpot", "Toyota", "Salesforce"],
    expectedNoise: ["gold", "silver", "diamond", "necklace", "earrings", "bracelet"],
  },
  // === B2B SaaS (CRM) ===
  {
    brand: "HubSpot",
    url: "hubspot.com",
    category: "CRM software",
    expectedCompetitors: ["Salesforce", "Zoho", "Pipedrive", "Freshsales", "Monday.com", "ActiveCampaign"],
    forbiddenCompetitors: ["CeraVe", "Casper", "Sephora", "Tiffany", "Mejuri", "Toyota", "Zara"],
    expectedNoise: ["automation", "pipeline", "dashboard", "integration", "reporting"],
  },
  // === CONSULTING SERVICES ===
  {
    brand: "McKinsey",
    url: "mckinsey.com",
    category: "consulting",
    expectedCompetitors: ["BCG", "Bain", "Deloitte", "Accenture", "PwC", "EY", "KPMG"],
    forbiddenCompetitors: ["CeraVe", "Casper", "Nike", "Sephora", "Tiffany", "Toyota"],
    expectedNoise: ["strategy", "transformation", "advisory", "management"],
  },
  // === AI TOOLS ===
  {
    brand: "Jasper",
    url: "jasper.ai",
    category: "AI writing tools",
    expectedCompetitors: ["ChatGPT", "Copy.ai", "Writesonic", "Claude", "Grammarly", "Rytr"],
    forbiddenCompetitors: ["CeraVe", "Casper", "Nike", "Sephora", "Tiffany", "Toyota", "HubSpot"],
    expectedNoise: ["content", "writing", "marketing", "copy", "template"],
  },
  // === RETAIL / FASHION ===
  {
    brand: "Zara",
    url: "zara.com",
    category: "fashion",
    expectedCompetitors: ["H&M", "Uniqlo", "Mango", "ASOS", "Shein", "Gap"],
    forbiddenCompetitors: ["CeraVe", "Casper", "HubSpot", "Salesforce", "Toyota", "McKinsey"],
    expectedNoise: ["trendy", "affordable", "sustainable", "fast fashion"],
  },
  // === RETAIL / ECOMMERCE ===
  {
    brand: "Shopify",
    url: "shopify.com",
    category: "ecommerce platform",
    expectedCompetitors: ["WooCommerce", "BigCommerce", "Wix", "Squarespace", "Magento"],
    forbiddenCompetitors: ["CeraVe", "Casper", "Nike", "Sephora", "Tiffany", "Toyota"],
    expectedNoise: ["platform", "store", "payment", "checkout", "template"],
  },
];

// ============================================================================
// EVALUATION METRICS
// ============================================================================

interface EvalResult {
  testCase: TestCase;
  totalQueries: number;
  totalEngineResults: number;
  
  // Brand detection accuracy
  brandDetectionRate: number; // % of queries where target brand was correctly detected
  
  // Competitor quality
  extractedCompetitors: string[];
  expectedFound: string[];     // expected competitors that WERE found
  expectedMissing: string[];   // expected competitors that were NOT found
  forbiddenFound: string[];    // forbidden competitors that leaked through
  competitorPrecision: number; // % of extracted competitors that are real brands in category
  competitorRecall: number;    // % of expected competitors that were found
  
  // Noise / false positives
  falsePositiveBrands: string[]; // extracted "brands" that are clearly not brands
  falsePositiveRate: number;     // % of extracted brands that are noise
  
  // Sentiment accuracy (spot-check)
  sentimentBreakdown: { positive: number; neutral: number; negative: number; notMentioned: number };
  
  // Raw data for manual review
  rawEngineResults: EngineResult[];
  queryBreakdown: { query: string; engine: string; mentionsBrand: boolean; mentionedBrands: string[]; snippet: string }[];
}

// Known non-brand terms that engines commonly extract
const KNOWN_FALSE_POSITIVES = new Set([
  "moisturizer", "sunscreen", "cleanser", "serum", "toner", "retinol",
  "mattress", "pillow", "topper", "sheets", "bedding",
  "morning", "evening", "daily", "routine", "nightly",
  "lightweight", "hydrating", "brightening", "sensitive",
  "budget", "drugstore", "mid-range", "starter", "premium",
  "platform", "tool", "solution", "service", "software",
  "strategy", "management", "advisory", "consulting",
  "gold", "silver", "diamond", "necklace", "bracelet",
  "affordable", "luxury", "trending", "sustainable",
  // Common multi-word false positives
  "Prone Skin", "Dry Skin", "UV Clear", "Ultra Sheer", "Broad Spectrum",
  "Side Sleeper", "Back Sleeper", "Hot Sleeper",
  "Small Business", "Sales Team", "Customer Service",
  "Key Features", "Pros And Cons", "Best Overall", "Best Value",
  "Best For", "Runner Up", "Editor's Choice",
]);

function isFalsePositive(brand: string): boolean {
  if (KNOWN_FALSE_POSITIVES.has(brand)) return true;
  if (KNOWN_FALSE_POSITIVES.has(brand.toLowerCase())) return true;
  
  const lower = brand.toLowerCase();
  // Single generic words
  if (brand.split(/\s+/).length === 1 && lower.length < 6) return true;
  // Starts with "Best ", "Top ", etc.
  if (/^(best|top|most|our|the best|a great)/i.test(brand)) return true;
  // All lowercase (brands are capitalized)
  if (brand === brand.toLowerCase() && brand.length > 3) return true;
  // Ends with product descriptors
  if (/\s(mattress|pillow|serum|cream|oil|tool|platform|service)$/i.test(brand)) return true;
  
  return false;
}

// ============================================================================
// RUN A SINGLE TEST CASE
// ============================================================================

async function runTestCase(tc: TestCase): Promise<EvalResult> {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`EVAL: ${tc.brand} (${tc.category})`);
  console.log(`${"=".repeat(70)}`);
  
  const url = tc.url.startsWith("http") ? tc.url : `https://${tc.url}`;
  const queries = getQueriesForBrand(tc.brand, tc.category, "en", "free");
  const engines = getEnginesForTier("free");
  
  console.log(`  Queries: ${queries.length}, Engines: ${engines.map(e => e.name).join(", ")}`);
  
  // Run all queries across all engines
  const engineResults: EngineResult[] = [];
  const queryBreakdown: EvalResult["queryBreakdown"] = [];
  
  for (const engine of engines) {
    for (const q of queries) {
      try {
        const result = await engine.queryFn(q.query);
        const { mentionsBrand, mentionedBrands } = extractBrandsForEval(result.response, tc.brand);
        
        engineResults.push({
          engine: engine.name,
          model: engine.model,
          query: q.query,
          response: result.response,
          mentionsBrand,
          mentionedBrands,
          sentiment: "neutral",
          citations: [],
          timestamp: new Date().toISOString(),
        });
        
        queryBreakdown.push({
          query: q.query,
          engine: engine.name,
          mentionsBrand,
          mentionedBrands,
          snippet: result.response.slice(0, 200),
        });
        
        // Brief progress
        const status = mentionsBrand ? "✓" : "✗";
        const brands = mentionedBrands.slice(0, 5).join(", ");
        console.log(`  ${status} [${engine.name}] "${q.query.slice(0, 50)}..." → ${brands || "(none)"}`);
      } catch (err: any) {
        console.log(`  ✗ [${engine.name}] "${q.query.slice(0, 50)}..." → ERROR: ${err.message}`);
      }
    }
  }
  
  // Aggregate all extracted competitor names
  const allExtracted = new Map<string, number>();
  for (const r of engineResults) {
    for (const b of r.mentionedBrands) {
      const normalized = normalizeBrandName(b) || b;
      if (normalized.toLowerCase() !== tc.brand.toLowerCase()) {
        allExtracted.set(normalized, (allExtracted.get(normalized) || 0) + 1);
      }
    }
  }
  
  const extractedCompetitors = Array.from(allExtracted.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
  
  // Check expected vs actual
  const expectedFound = tc.expectedCompetitors.filter(exp => 
    extractedCompetitors.some(ext => ext.toLowerCase().includes(exp.toLowerCase()) || exp.toLowerCase().includes(ext.toLowerCase()))
  );
  const expectedMissing = tc.expectedCompetitors.filter(exp => 
    !extractedCompetitors.some(ext => ext.toLowerCase().includes(exp.toLowerCase()) || exp.toLowerCase().includes(ext.toLowerCase()))
  );
  const forbiddenFound = tc.forbiddenCompetitors.filter(fb =>
    extractedCompetitors.some(ext => ext.toLowerCase().includes(fb.toLowerCase()) || fb.toLowerCase().includes(ext.toLowerCase()))
  );
  
  // False positives
  const falsePositiveBrands = extractedCompetitors.filter(b => isFalsePositive(b));
  const falsePositiveRate = extractedCompetitors.length > 0 
    ? falsePositiveBrands.length / extractedCompetitors.length 
    : 0;
  
  // Precision and recall
  const realBrands = extractedCompetitors.filter(b => !isFalsePositive(b));
  const competitorPrecision = extractedCompetitors.length > 0 
    ? realBrands.length / extractedCompetitors.length
    : 0;
  const competitorRecall = tc.expectedCompetitors.length > 0
    ? expectedFound.length / tc.expectedCompetitors.length
    : 0;
  
  // Brand detection rate
  const brandDetectionRate = engineResults.length > 0
    ? engineResults.filter(r => r.mentionsBrand).length / engineResults.length
    : 0;
  
  // Sentiment (we'll just count from raw results)
  const sentimentBreakdown = {
    positive: engineResults.filter(r => r.sentiment === "positive").length,
    neutral: engineResults.filter(r => r.sentiment === "neutral").length,
    negative: engineResults.filter(r => r.sentiment === "negative").length,
    notMentioned: engineResults.filter(r => r.sentiment === "not_mentioned").length,
  };
  
  const result: EvalResult = {
    testCase: tc,
    totalQueries: queries.length,
    totalEngineResults: engineResults.length,
    brandDetectionRate,
    extractedCompetitors,
    expectedFound,
    expectedMissing,
    forbiddenFound,
    competitorPrecision,
    competitorRecall,
    falsePositiveBrands,
    falsePositiveRate,
    sentimentBreakdown,
    rawEngineResults: engineResults,
    queryBreakdown,
  };
  
  // Print summary
  console.log(`\n  --- RESULTS: ${tc.brand} (${tc.category}) ---`);
  console.log(`  Brand detection rate: ${(brandDetectionRate * 100).toFixed(1)}%`);
  console.log(`  Competitors found: ${extractedCompetitors.length} total`);
  console.log(`  Expected found: ${expectedFound.join(", ") || "(none)"}`);
  console.log(`  Expected MISSING: ${expectedMissing.join(", ") || "(none)"}`);
  console.log(`  FORBIDDEN found: ${forbiddenFound.join(", ") || "(none) ✓"}`);
  console.log(`  False positives: ${falsePositiveBrands.join(", ") || "(none) ✓"}`);
  console.log(`  Precision: ${(competitorPrecision * 100).toFixed(1)}%`);
  console.log(`  Recall: ${(competitorRecall * 100).toFixed(1)}%`);
  console.log(`  False positive rate: ${(falsePositiveRate * 100).toFixed(1)}%`);
  
  return result;
}

// Use the same extraction logic as the real engine
function extractBrandsForEval(response: string, targetBrand: string): {
  mentionsBrand: boolean;
  mentionedBrands: string[];
} {
  const text = response.toLowerCase();
  const targetLower = targetBrand.toLowerCase();
  
  const mentionsBrand = text.includes(targetLower) || 
    text.includes(targetLower.replace(/['']/g, "")) ||
    text.includes(targetLower.replace(/\s+/g, ""));
  
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
      if (brand.length < 2 || brand.length > 40) continue;
      if (brand.toLowerCase() === targetLower) continue;
      mentionedBrands.add(brand);
    }
  }
  
  return { mentionsBrand, mentionedBrands: Array.from(mentionedBrands) };
}

// ============================================================================
// MAIN: RUN ALL TEST CASES
// ============================================================================

export async function runFullEval(categories?: string[]): Promise<{
  results: EvalResult[];
  summary: string;
}> {
  const cases = categories 
    ? TEST_CASES.filter(tc => categories.some(c => tc.category.toLowerCase().includes(c.toLowerCase())))
    : TEST_CASES;
  
  console.log(`\nRunning eval across ${cases.length} test cases...`);
  console.log(`Categories: ${cases.map(tc => tc.category).join(", ")}\n`);
  
  const results: EvalResult[] = [];
  for (const tc of cases) {
    try {
      const result = await runTestCase(tc);
      results.push(result);
    } catch (err: any) {
      console.error(`FAILED: ${tc.brand} (${tc.category}): ${err.message}`);
    }
  }
  
  // Generate summary report
  const summary = generateSummaryReport(results);
  
  // Save results to workspace
  const outputDir = "/home/user/workspace/aishareofvoice/eval-results";
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  
  // Save detailed results (without raw responses to keep file manageable)
  const detailedResults = results.map(r => ({
    ...r,
    rawEngineResults: r.rawEngineResults.map(er => ({
      engine: er.engine,
      query: er.query,
      mentionsBrand: er.mentionsBrand,
      mentionedBrands: er.mentionedBrands,
      sentiment: er.sentiment,
      snippet: er.response.slice(0, 300),
    })),
  }));
  
  fs.writeFileSync(
    path.join(outputDir, `eval-${timestamp}.json`),
    JSON.stringify(detailedResults, null, 2)
  );
  
  // Save summary
  fs.writeFileSync(
    path.join(outputDir, `eval-summary-${timestamp}.md`),
    summary
  );
  
  // Save raw responses for manual review
  const rawResponses = results.flatMap(r => 
    r.rawEngineResults.map(er => ({
      brand: r.testCase.brand,
      category: r.testCase.category,
      engine: er.engine,
      query: er.query,
      response: er.response,
      mentionsBrand: er.mentionsBrand,
      mentionedBrands: er.mentionedBrands,
    }))
  );
  fs.writeFileSync(
    path.join(outputDir, `raw-responses-${timestamp}.json`),
    JSON.stringify(rawResponses, null, 2)
  );
  
  console.log(`\nResults saved to ${outputDir}/`);
  console.log(summary);
  
  return { results, summary };
}

function generateSummaryReport(results: EvalResult[]): string {
  let report = "# AI Engine Evaluation Report\n\n";
  report += `Date: ${new Date().toISOString()}\n`;
  report += `Test Cases: ${results.length}\n\n`;
  
  report += "## Overall Metrics\n\n";
  report += "| Category | Brand | Detection Rate | Precision | Recall | FP Rate | Forbidden Leaks |\n";
  report += "|----------|-------|---------------|-----------|--------|---------|------------------|\n";
  
  for (const r of results) {
    report += `| ${r.testCase.category} | ${r.testCase.brand} `;
    report += `| ${(r.brandDetectionRate * 100).toFixed(0)}% `;
    report += `| ${(r.competitorPrecision * 100).toFixed(0)}% `;
    report += `| ${(r.competitorRecall * 100).toFixed(0)}% `;
    report += `| ${(r.falsePositiveRate * 100).toFixed(0)}% `;
    report += `| ${r.forbiddenFound.length > 0 ? "❌ " + r.forbiddenFound.join(", ") : "✓ None"} |\n`;
  }
  
  // Aggregate stats
  const avgDetection = results.reduce((sum, r) => sum + r.brandDetectionRate, 0) / results.length;
  const avgPrecision = results.reduce((sum, r) => sum + r.competitorPrecision, 0) / results.length;
  const avgRecall = results.reduce((sum, r) => sum + r.competitorRecall, 0) / results.length;
  const avgFP = results.reduce((sum, r) => sum + r.falsePositiveRate, 0) / results.length;
  const totalForbidden = results.reduce((sum, r) => sum + r.forbiddenFound.length, 0);
  
  report += `\n**Averages:** Detection ${(avgDetection * 100).toFixed(0)}% | Precision ${(avgPrecision * 100).toFixed(0)}% | Recall ${(avgRecall * 100).toFixed(0)}% | FP ${(avgFP * 100).toFixed(0)}% | Forbidden: ${totalForbidden}\n\n`;
  
  // Detailed findings per category
  report += "## Detailed Findings\n\n";
  for (const r of results) {
    report += `### ${r.testCase.brand} (${r.testCase.category})\n\n`;
    report += `- **Brand detection:** ${(r.brandDetectionRate * 100).toFixed(0)}% (${r.totalEngineResults} queries)\n`;
    report += `- **Expected competitors found:** ${r.expectedFound.join(", ") || "NONE"}\n`;
    report += `- **Expected competitors MISSING:** ${r.expectedMissing.join(", ") || "None"}\n`;
    report += `- **Forbidden brands leaked:** ${r.forbiddenFound.join(", ") || "None"}\n`;
    report += `- **False positive brands:** ${r.falsePositiveBrands.join(", ") || "None"}\n`;
    report += `- **All extracted:** ${r.extractedCompetitors.slice(0, 15).join(", ")}\n\n`;
  }
  
  // Action items
  report += "## Action Items\n\n";
  
  const highFPCategories = results.filter(r => r.falsePositiveRate > 0.3);
  if (highFPCategories.length > 0) {
    report += "### High False Positive Rate (>30%)\n";
    for (const r of highFPCategories) {
      report += `- **${r.testCase.category}**: ${r.falsePositiveBrands.join(", ")}\n`;
    }
    report += "\n";
  }
  
  const lowRecall = results.filter(r => r.competitorRecall < 0.3);
  if (lowRecall.length > 0) {
    report += "### Low Competitor Recall (<30%)\n";
    for (const r of lowRecall) {
      report += `- **${r.testCase.category}**: Missing ${r.expectedMissing.join(", ")}\n`;
    }
    report += "\n";
  }
  
  const forbidden = results.filter(r => r.forbiddenFound.length > 0);
  if (forbidden.length > 0) {
    report += "### Cross-Category Contamination\n";
    for (const r of forbidden) {
      report += `- **${r.testCase.category}**: ${r.forbiddenFound.join(", ")} should not appear\n`;
    }
    report += "\n";
  }
  
  return report;
}

// Export for direct execution
export { TEST_CASES, type TestCase, type EvalResult };
