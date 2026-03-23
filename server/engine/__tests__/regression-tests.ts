/**
 * AI Engine Regression Tests
 * 
 * Run these after any engine change to ensure accuracy doesn't degrade.
 * Tests known-good results against expected baselines.
 * 
 * Usage: npx tsx server/engine/__tests__/regression-tests.ts
 */

const API_BASE = "http://127.0.0.1:5000";

interface RegressionTest {
  name: string;
  brand: string;
  url: string;
  category: string;
  // At least N of these should appear in competitors
  expectedCompetitors: string[];
  minExpectedFound: number;
  // These should NEVER appear
  forbiddenCompetitors: string[];
  // Score thresholds
  minOverallScore: number;
  maxFalsePositiveRate: number; // 0-1
}

const REGRESSION_TESTS: RegressionTest[] = [
  {
    name: "Skincare: CeraVe",
    brand: "CeraVe",
    url: "https://cerave.com",
    category: "skincare",
    expectedCompetitors: ["La Roche-Posay", "Cetaphil", "Neutrogena", "The Ordinary", "Vanicream", "Paula's Choice", "Eucerin", "Aveeno"],
    minExpectedFound: 4,
    forbiddenCompetitors: ["Apple", "Nike", "Samsung", "Tesla", "Casper", "HubSpot", "Toyota", "Salesforce", "McKinsey", "Zara"],
    minOverallScore: 40,
    maxFalsePositiveRate: 0.2,
  },
  {
    name: "CRM: HubSpot",
    brand: "HubSpot",
    url: "https://hubspot.com",
    category: "CRM software",
    expectedCompetitors: ["Salesforce", "Zoho", "Pipedrive", "Freshsales", "Monday", "ActiveCampaign", "Copper", "Insightly"],
    minExpectedFound: 4,
    forbiddenCompetitors: ["CeraVe", "Casper", "Sephora", "Tiffany", "Mejuri", "Toyota", "Zara", "Nike"],
    minOverallScore: 50,
    maxFalsePositiveRate: 0.2,
  },
  {
    name: "Jewelry: Mejuri",
    brand: "Mejuri",
    url: "https://mejuri.com",
    category: "jewelry",
    expectedCompetitors: ["Tiffany", "Pandora", "Ana Luisa", "Missoma", "Monica Vinader", "Gorjana", "Kendra Scott", "Catbird"],
    minExpectedFound: 4,
    forbiddenCompetitors: ["Apple", "Nike", "CeraVe", "Casper", "HubSpot", "Toyota", "Salesforce", "McKinsey"],
    minOverallScore: 40,
    maxFalsePositiveRate: 0.2,
  },
  {
    name: "Mattresses: Saatva",
    brand: "Saatva",
    url: "https://saatva.com",
    category: "mattresses",
    expectedCompetitors: ["Casper", "Purple", "Tempur-Pedic", "Tuft & Needle", "Helix", "Brooklyn Bedding", "WinkBed", "DreamCloud"],
    minExpectedFound: 3,
    forbiddenCompetitors: ["Apple", "Nike", "CeraVe", "HubSpot", "Sephora", "Toyota", "McKinsey"],
    minOverallScore: 40,
    maxFalsePositiveRate: 0.3,
  },
];

// Known false positive patterns — if any of these appear as a competitor name, it's a regression
const KNOWN_FALSE_POSITIVE_PATTERNS = [
  /^(moisturizer|sunscreen|cleanser|serum|retinol|toner)$/i,
  /^(mattress|pillow|topper|sheets|bedding)$/i,
  /^(platform|tool|solution|service|software)$/i,
  /^(gold|silver|diamond|necklace|bracelet)$/i,
  /^(strategy|management|automation|pipeline)$/i,
  /^(tip|why|how|what|broad|fragrance|ceramides|bakuchiol)$/i,
  /^(strengths|limitations|integrations|pricing|features)$/i,
  /^(start|apply|wear|look|pick|choose|consider|check|avoid)$/i,
  /^(best|top|most|our|the)\s/i,
  /\s(skin|sleeper|features|options|position)$/i,
];

function isFalsePositive(name: string): boolean {
  for (const p of KNOWN_FALSE_POSITIVE_PATTERNS) {
    if (p.test(name)) return true;
  }
  // All lowercase strings > 3 chars are suspicious
  if (name === name.toLowerCase() && name.length > 3) return true;
  return false;
}

async function runTest(test: RegressionTest): Promise<{
  passed: boolean;
  failures: string[];
  details: string;
}> {
  const failures: string[] = [];
  
  try {
    const resp = await fetch(`${API_BASE}/api/audit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: test.url,
        brandName: test.brand,
        category: test.category,
        tier: "free",
        language: "en",
      }),
    });

    if (!resp.ok) {
      return { passed: false, failures: [`API returned ${resp.status}`], details: "" };
    }

    const data = await resp.json();
    const scores = data.scores || {};
    const competitors = (scores.competitors || []) as { name: string; mentionRate: number }[];
    const competitorNames = competitors.map((c: any) => c.name);

    // Test 1: Minimum overall score
    const overallScore = scores.overall?.score || 0;
    if (overallScore < test.minOverallScore) {
      failures.push(`Score ${overallScore} < min ${test.minOverallScore}`);
    }

    // Test 2: Expected competitors found
    const expectedFound = test.expectedCompetitors.filter(exp =>
      competitorNames.some((ext: string) =>
        ext.toLowerCase().includes(exp.toLowerCase()) ||
        exp.toLowerCase().includes(ext.toLowerCase())
      )
    );
    if (expectedFound.length < test.minExpectedFound) {
      const missing = test.expectedCompetitors.filter(e => !expectedFound.includes(e));
      failures.push(`Only ${expectedFound.length}/${test.minExpectedFound} expected competitors found. Missing: ${missing.join(", ")}`);
    }

    // Test 3: No forbidden competitors
    const forbiddenFound = test.forbiddenCompetitors.filter(fb =>
      competitorNames.some((ext: string) =>
        ext.toLowerCase().includes(fb.toLowerCase()) ||
        fb.toLowerCase().includes(ext.toLowerCase())
      )
    );
    if (forbiddenFound.length > 0) {
      failures.push(`FORBIDDEN competitors leaked: ${forbiddenFound.join(", ")}`);
    }

    // Test 4: False positive rate
    const fpBrands = competitorNames.filter((n: string) => isFalsePositive(n));
    const fpRate = competitorNames.length > 0 ? fpBrands.length / competitorNames.length : 0;
    if (fpRate > test.maxFalsePositiveRate) {
      failures.push(`False positive rate ${(fpRate * 100).toFixed(0)}% > max ${(test.maxFalsePositiveRate * 100).toFixed(0)}%. FPs: ${fpBrands.join(", ")}`);
    }

    const details = [
      `Score: ${overallScore}/100`,
      `Competitors: ${competitorNames.slice(0, 8).join(", ")}`,
      `Expected found: ${expectedFound.length}/${test.expectedCompetitors.length}`,
      `Forbidden leaks: ${forbiddenFound.length}`,
      `False positives: ${fpBrands.length}/${competitorNames.length}`,
    ].join(" | ");

    return { passed: failures.length === 0, failures, details };
  } catch (err: any) {
    return { passed: false, failures: [`Error: ${err.message}`], details: "" };
  }
}

async function main() {
  console.log("AI Engine Regression Tests");
  console.log("=".repeat(70));
  console.log();
  
  let passCount = 0;
  let failCount = 0;
  
  for (const test of REGRESSION_TESTS) {
    console.log(`Running: ${test.name}...`);
    const result = await runTest(test);
    
    if (result.passed) {
      passCount++;
      console.log(`  ✅ PASSED — ${result.details}`);
    } else {
      failCount++;
      console.log(`  ❌ FAILED`);
      for (const f of result.failures) {
        console.log(`     - ${f}`);
      }
      if (result.details) console.log(`     ${result.details}`);
    }
    console.log();
  }
  
  console.log("=".repeat(70));
  console.log(`Results: ${passCount} passed, ${failCount} failed out of ${REGRESSION_TESTS.length} tests`);
  
  if (failCount > 0) {
    console.log("\n⚠️  ENGINE REGRESSION DETECTED — review before deploying");
    process.exit(1);
  } else {
    console.log("\n✅ All regression tests passed");
    process.exit(0);
  }
}

main();
