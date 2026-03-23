/**
 * AI Engine Evaluation Runner
 * 
 * Runs live audits through the API for diverse categories,
 * captures raw responses, and evaluates engine accuracy.
 */

const TEST_CASES = [
  {
    brand: "CeraVe",
    url: "https://cerave.com",
    category: "skincare",
    expectedCompetitors: ["La Roche-Posay", "The Ordinary", "Cetaphil", "Neutrogena", "Vanicream", "Paula's Choice"],
    forbiddenCompetitors: ["Apple", "Nike", "Samsung", "Tesla", "Casper", "HubSpot", "Toyota", "Salesforce", "McKinsey"],
  },
  {
    brand: "Saatva",
    url: "https://saatva.com",
    category: "mattresses",
    expectedCompetitors: ["Casper", "Purple", "Tempur-Pedic", "Tuft & Needle", "Helix", "Brooklyn Bedding", "WinkBed"],
    forbiddenCompetitors: ["Apple", "Nike", "CeraVe", "HubSpot", "Sephora", "Toyota", "Mercedes", "McKinsey"],
  },
  {
    brand: "HubSpot",
    url: "https://hubspot.com",
    category: "CRM software",
    expectedCompetitors: ["Salesforce", "Zoho", "Pipedrive", "Freshsales", "Monday.com", "ActiveCampaign"],
    forbiddenCompetitors: ["CeraVe", "Casper", "Sephora", "Tiffany", "Mejuri", "Toyota", "Zara", "Nike"],
  },
  {
    brand: "Mejuri",
    url: "https://mejuri.com",
    category: "jewelry",
    expectedCompetitors: ["Tiffany", "Pandora", "Ana Luisa", "Missoma", "Monica Vinader", "Gorjana", "Kendra Scott"],
    forbiddenCompetitors: ["Apple", "Nike", "CeraVe", "Casper", "HubSpot", "Toyota", "Salesforce", "McKinsey"],
  },
];

async function runAudit(testCase) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`RUNNING AUDIT: ${testCase.brand} (${testCase.category})`);
  console.log(`${"=".repeat(70)}`);

  const startTime = Date.now();
  
  try {
    const resp = await fetch("http://127.0.0.1:5000/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: testCase.url,
        brandName: testCase.brand,
        category: testCase.category,
        tier: "free",
        language: "en",
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error(`  FAILED: HTTP ${resp.status}: ${err}`);
      return null;
    }

    const result = await resp.json();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  Completed in ${elapsed}s`);
    
    return { testCase, result, elapsed };
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
    return null;
  }
}

function evaluateResult(auditData) {
  const { testCase, result } = auditData;
  const scores = result.scores;
  const competitors = scores.competitors || [];
  const queryDetails = scores.queryDetails || [];
  
  const extractedNames = competitors.map(c => c.name);
  
  // Check expected competitors found
  const expectedFound = testCase.expectedCompetitors.filter(exp =>
    extractedNames.some(ext => 
      ext.toLowerCase().includes(exp.toLowerCase()) || 
      exp.toLowerCase().includes(ext.toLowerCase())
    )
  );
  const expectedMissing = testCase.expectedCompetitors.filter(exp =>
    !extractedNames.some(ext => 
      ext.toLowerCase().includes(exp.toLowerCase()) || 
      exp.toLowerCase().includes(ext.toLowerCase())
    )
  );
  
  // Check forbidden competitors that leaked through
  const forbiddenFound = testCase.forbiddenCompetitors.filter(fb =>
    extractedNames.some(ext => 
      ext.toLowerCase().includes(fb.toLowerCase()) || 
      fb.toLowerCase().includes(ext.toLowerCase())
    )
  );
  
  // Check for obvious false positives (generic terms extracted as brands)
  const genericTerms = new Set([
    "moisturizer", "sunscreen", "cleanser", "serum", "retinol",
    "mattress", "pillow", "firmness", "cooling", "memory foam",
    "platform", "tool", "solution", "service", "software",
    "gold", "silver", "diamond", "necklace", "bracelet",
    "budget", "premium", "luxury", "affordable", "sustainable",
    "strategy", "management", "automation", "pipeline",
    "morning", "evening", "daily", "routine", "best overall",
    "runner up", "editor's choice", "key features", "pros and cons",
    "best for", "best value", "our pick", "top pick",
  ]);
  
  const falsePositives = extractedNames.filter(name => {
    const lower = name.toLowerCase();
    if (genericTerms.has(lower)) return true;
    if (name === name.toLowerCase() && name.length > 3) return true;
    if (/^(best|top|most|our|the)\s/i.test(name)) return true;
    if (/\s(mattress|serum|cream|platform|tool|service)$/i.test(name)) return true;
    return false;
  });
  
  // Analyze query breakdown
  let totalResponses = 0;
  let brandMentionCount = 0;
  let allMentionedBrands = new Map();
  
  for (const qd of queryDetails) {
    for (const r of qd.results) {
      totalResponses++;
      if (r.mentionsBrand) brandMentionCount++;
      for (const b of r.mentionedBrands) {
        allMentionedBrands.set(b, (allMentionedBrands.get(b) || 0) + 1);
      }
    }
  }
  
  const recall = testCase.expectedCompetitors.length > 0 
    ? expectedFound.length / testCase.expectedCompetitors.length : 0;
  const precision = extractedNames.length > 0
    ? (extractedNames.length - falsePositives.length) / extractedNames.length : 0;
  
  const evaluation = {
    brand: testCase.brand,
    category: testCase.category,
    overallScore: scores.overall?.score,
    overallGrade: scores.overall?.grade,
    brandDetectionRate: totalResponses > 0 ? (brandMentionCount / totalResponses * 100).toFixed(1) + "%" : "N/A",
    totalCompetitorsExtracted: extractedNames.length,
    competitors: extractedNames,
    expectedFound,
    expectedMissing,
    forbiddenLeaks: forbiddenFound,
    falsePositives,
    recall: (recall * 100).toFixed(1) + "%",
    precision: (precision * 100).toFixed(1) + "%",
    sentimentBreakdown: scores.sentimentBreakdown,
    perEngine: scores.perEngine,
    dimensions: scores.dimensions,
    totalResponses,
    brandMentionCount,
    // Raw top brands by frequency
    topBrandsRaw: Array.from(allMentionedBrands.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, count]) => `${name} (${count}x)`),
  };
  
  return evaluation;
}

function printEvaluation(ev) {
  console.log(`\n--- EVALUATION: ${ev.brand} (${ev.category}) ---`);
  console.log(`  Overall Score: ${ev.overallScore}/100 (${ev.overallGrade})`);
  console.log(`  Brand Detection Rate: ${ev.brandDetectionRate}`);
  console.log(`  Total Responses: ${ev.totalResponses}, Brand Mentions: ${ev.brandMentionCount}`);
  console.log(`  Competitors Extracted: ${ev.totalCompetitorsExtracted}`);
  console.log(`  Top Extracted: ${ev.competitors.slice(0, 10).join(", ")}`);
  console.log(`  Expected Found (${ev.expectedFound.length}/${ev.expectedFound.length + ev.expectedMissing.length}): ${ev.expectedFound.join(", ") || "(none)"}`);
  console.log(`  Expected MISSING: ${ev.expectedMissing.join(", ") || "(none)"}`);
  console.log(`  FORBIDDEN Leaks: ${ev.forbiddenLeaks.length > 0 ? "❌ " + ev.forbiddenLeaks.join(", ") : "✓ None"}`);
  console.log(`  False Positives: ${ev.falsePositives.length > 0 ? "⚠ " + ev.falsePositives.join(", ") : "✓ None"}`);
  console.log(`  Precision: ${ev.precision}, Recall: ${ev.recall}`);
  console.log(`  Sentiment: +${ev.sentimentBreakdown?.positive || 0} / =${ev.sentimentBreakdown?.neutral || 0} / -${ev.sentimentBreakdown?.negative || 0} / ∅${ev.sentimentBreakdown?.notMentioned || 0}`);
  console.log(`  Per-Engine: ${JSON.stringify(ev.perEngine)}`);
  console.log(`  Raw Top Brands: ${ev.topBrandsRaw.join(", ")}`);
}

async function main() {
  console.log("AI Engine Evaluation Runner");
  console.log(`Running ${TEST_CASES.length} test cases...\n`);
  
  const results = [];
  const evaluations = [];
  
  for (const tc of TEST_CASES) {
    const auditData = await runAudit(tc);
    if (auditData) {
      results.push(auditData);
      const ev = evaluateResult(auditData);
      evaluations.push(ev);
      printEvaluation(ev);
    }
  }
  
  // Summary table
  console.log(`\n\n${"=".repeat(80)}`);
  console.log("SUMMARY");
  console.log(`${"=".repeat(80)}`);
  console.log("Category       | Brand     | Score | Detection | Precision | Recall | Forbidden | FPs");
  console.log("---------------|-----------|-------|-----------|-----------|--------|-----------|----");
  for (const ev of evaluations) {
    const cat = ev.category.padEnd(14);
    const brand = ev.brand.padEnd(9);
    const score = String(ev.overallScore).padEnd(5);
    const det = ev.brandDetectionRate.padEnd(9);
    const prec = ev.precision.padEnd(9);
    const rec = ev.recall.padEnd(6);
    const forb = String(ev.forbiddenLeaks.length).padEnd(9);
    const fps = String(ev.falsePositives.length);
    console.log(`${cat} | ${brand} | ${score} | ${det} | ${prec} | ${rec} | ${forb} | ${fps}`);
  }
  
  // Save full results
  const fs = require("fs");
  const outputDir = "/home/user/workspace/aishareofvoice/eval-results";
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  
  // Save evaluations
  fs.writeFileSync(
    `${outputDir}/eval-${timestamp}.json`,
    JSON.stringify(evaluations, null, 2)
  );
  
  // Save raw audit results (with full query details and engine responses)
  const rawData = results.map(r => ({
    brand: r.testCase.brand,
    category: r.testCase.category,
    elapsed: r.elapsed,
    scores: r.result.scores,
    geoAudit: r.result.geoAudit,
    recommendations: r.result.recommendations,
    engineResults: r.result.engineResults?.map(er => ({
      engine: er.engine,
      query: er.query,
      mentionsBrand: er.mentionsBrand,
      mentionedBrands: er.mentionedBrands,
      sentiment: er.sentiment,
      response: er.response,
    })),
  }));
  
  fs.writeFileSync(
    `${outputDir}/raw-audit-results-${timestamp}.json`,
    JSON.stringify(rawData, null, 2)
  );
  
  console.log(`\nResults saved to ${outputDir}/`);
  
  // Aggregate issues
  const totalForbidden = evaluations.reduce((s, e) => s + e.forbiddenLeaks.length, 0);
  const totalFPs = evaluations.reduce((s, e) => s + e.falsePositives.length, 0);
  const avgPrecision = evaluations.reduce((s, e) => s + parseFloat(e.precision), 0) / evaluations.length;
  const avgRecall = evaluations.reduce((s, e) => s + parseFloat(e.recall), 0) / evaluations.length;
  
  console.log(`\nAGGREGATE:`);
  console.log(`  Avg Precision: ${avgPrecision.toFixed(1)}%`);
  console.log(`  Avg Recall: ${avgRecall.toFixed(1)}%`);
  console.log(`  Total Forbidden Leaks: ${totalForbidden}`);
  console.log(`  Total False Positives: ${totalFPs}`);
  
  if (totalForbidden > 0) {
    console.log(`\n⚠️ CROSS-CATEGORY CONTAMINATION DETECTED:`);
    for (const ev of evaluations) {
      if (ev.forbiddenLeaks.length > 0) {
        console.log(`  ${ev.category}: ${ev.forbiddenLeaks.join(", ")}`);
      }
    }
  }
  
  if (totalFPs > 0) {
    console.log(`\n⚠️ FALSE POSITIVE BRANDS DETECTED:`);
    for (const ev of evaluations) {
      if (ev.falsePositives.length > 0) {
        console.log(`  ${ev.category}: ${ev.falsePositives.join(", ")}`);
      }
    }
  }
}

main().catch(console.error);
