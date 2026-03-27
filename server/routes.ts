import { Hono } from "hono";
import { type IStorage } from "./storage";
import { runAudit } from "./engine/audit-runner";
import { detectBrandFromUrl, detectCategoryWithAI } from "./engine/brand-detection";
import { discoverCompetitors } from "./engine/competitor-discovery";
import { pushLeadToAttio } from "./engine/attio";
import { auditRequestSchema } from "@shared/schema";
import { checkDedupe, markInFlight, markCompleted } from "./engine/idempotency";
import { checkSpendBudget, getTodaySpend, recordAuditSpend } from "./engine/spend-tracker";
import { isDisposableEmail, checkConcurrentLimit, incrementConcurrent, decrementConcurrent, checkProgressiveThrottle, recordAuditTimestamp } from "./engine/abuse-control";
import { getAllCircuitStates } from "./engine/circuit-breaker";
import { logger, generateRequestId, setRequestId } from "./engine/logger";
// Gap 2: Concurrency control
import { checkGlobalCapacity, acquireGlobalWeight, releaseGlobalWeight } from "./engine/concurrency";
// Gap 5: Async job system
import { generateJobId, createJob, getJob, markJobRunning, markJobCompleted, markJobFailed, updateJobProgress } from "./engine/job-system";
// Gap 12: GDPR deletion
import { deleteUserData, cleanupExpiredAudits, RETENTION_DAYS } from "./engine/data-retention";
// Gap 13: Multi-tenancy
import { validateTierAccess, recordOrgAudit } from "./engine/multi-tenancy";
// Gap 14: Scheduler
import { getSchedule, recordScheduleRun, getSchedulesForEmail, validateTriggerRequest } from "./engine/scheduler";
// Gap 19/20: Result caching
import { getCachedBrandDetection, setCachedBrandDetection } from "./engine/result-cache";
import { getCacheStats } from "./engine/cache";

// Max free (snapshot) audits per email
// TODO: Re-enable limits after testing is complete
const MAX_SNAPSHOT_AUDITS_PER_EMAIL = 999; // was 3
// Max audits per IP per hour (without email)
const MAX_AUDITS_PER_IP_HOUR = 999; // was 5

// Feature flag: set to false to skip email requirement during testing
const REQUIRE_EMAIL_FOR_SNAPSHOT = false; // TODO: set to true for production

// Extract IP from request
function getIp(c: any): string {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() 
    || c.req.header("cf-connecting-ip") 
    || "unknown";
}

export function createApiRoutes(storage: IStorage) {
  const api = new Hono();

  // ── Request tracing middleware ──────────────────────────────────────
  api.use("*", async (c, next) => {
    const reqId = c.req.header("x-asov-request-id") || generateRequestId();
    setRequestId(reqId);
    c.header("x-asov-request-id", reqId);
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    logger.info("request", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: ms,
      ip: getIp(c),
    });
  });

  // ── Detect brand from URL ──────────────────────────────────────────
  api.post("/detect", async (c) => {
    try {
      const { url } = await c.req.json();
      if (!url) return c.json({ error: "URL required" }, 400);
      
      // Gap 20: Check brand detection cache first
      const cached = await getCachedBrandDetection(url);
      if (cached) {
        return c.json({ ...cached, categorySource: "cached" });
      }
      
      const detected = detectBrandFromUrl(url);
      if (!detected) {
        return c.json({ brand: "Unknown", category: "general", categoryConfidence: "low", categoryReason: "Could not identify brand from URL", categorySource: "ai_inferred" });
      }
      
      if (detected.category) {
        // Cache the result
        await setCachedBrandDetection(url, { brand: detected.brand, category: detected.category, confidence: "high" });
        return c.json({ ...detected, categoryConfidence: "high", categoryReason: `${detected.brand} is a well-known brand in this space`, categorySource: "known_domain" });
      }
      
      logger.info("detect_ai_infer", { brand: detected.brand });
      const aiResult = await detectCategoryWithAI(url, detected.brand);
      logger.info("detect_ai_result", { category: aiResult.category, confidence: aiResult.confidence });
      
      // Cache AI-inferred results to save future API calls
      await setCachedBrandDetection(url, { brand: detected.brand, category: aiResult.category, confidence: aiResult.confidence });
      
      return c.json({ brand: detected.brand, category: aiResult.category, categoryConfidence: aiResult.confidence, categoryReason: aiResult.reason, categorySource: aiResult.source });
    } catch (error: any) {
      logger.error("detect_error", { error: error.message });
      return c.json({ error: error.message }, 500);
    }
  });
  
  // ── Combined detect + competitor discovery ─────────────────────────
  api.post("/detect-all", async (c) => {
    try {
      const { url } = await c.req.json();
      if (!url) return c.json({ error: "URL required" }, 400);
      
      const detected = detectBrandFromUrl(url);
      const brand = detected?.brand || "Unknown";
      
      if (detected?.category) {
        const competitors = await discoverCompetitors(brand, detected.category, url);
        return c.json({
          brand, category: detected.category,
          categoryConfidence: "high",
          categoryReason: `${brand} is a well-known brand in this space`,
          categorySource: "known_domain",
          competitors,
        });
      }
      
      const aiResult = await detectCategoryWithAI(url, brand);
      const competitors = await discoverCompetitors(brand, aiResult.category || "general", url);
      
      return c.json({
        brand, category: aiResult.category,
        categoryConfidence: aiResult.confidence,
        categoryReason: aiResult.reason,
        categorySource: aiResult.source,
        competitors,
      });
    } catch (error: any) {
      logger.error("detect_all_error", { error: error.message });
      return c.json({ error: error.message }, 500);
    }
  });

  // ── Discover competitors ───────────────────────────────────────────
  api.post("/discover-competitors", async (c) => {
    try {
      const { brandName, category, url } = await c.req.json();
      if (!brandName) return c.json({ error: "Brand name required" }, 400);
      
      const cat = category || "general";
      const competitors = await discoverCompetitors(brandName, cat, url);
      return c.json({ competitors });
    } catch (error: any) {
      logger.error("discover_error", { error: error.message });
      return c.json({ error: error.message }, 500);
    }
  });

  // ── Email gate: register lead ──────────────────────────────────────
  api.post("/lead", async (c) => {
    try {
      const { email } = await c.req.json();
      if (!email || typeof email !== "string" || !email.includes("@")) {
        return c.json({ error: "Valid email required" }, 400);
      }
      
      // Disposable email check
      if (isDisposableEmail(email)) {
        return c.json({ error: "disposable_email", message: "Please use a work or personal email address. Temporary emails are not accepted." }, 400);
      }
      
      const lead = await storage.getOrCreateLead(email);
      return c.json({
        email: lead.email,
        auditCount: lead.auditCount,
        canAudit: lead.auditCount < MAX_SNAPSHOT_AUDITS_PER_EMAIL,
        remaining: Math.max(0, MAX_SNAPSHOT_AUDITS_PER_EMAIL - lead.auditCount),
      });
    } catch (error: any) {
      logger.error("lead_error", { error: error.message });
      return c.json({ error: error.message }, 500);
    }
  });
  
  // ── Run a full audit ───────────────────────────────────────────────
  api.post("/audit", async (c) => {
    try {
      const body = await c.req.json();
      const parsed = auditRequestSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: "Invalid request: " + parsed.error.issues.map(i => i.message).join(", ") }, 400);
      }
      
      const data = parsed.data;
      const ip = getIp(c);
      
      logger.audit("request_received", { brand: data.brandName, url: data.url, tier: data.tier, mode: data.mode });
      
      // ── Basic validation only (rate limits disabled for testing) ──
      // NOTE: All Redis-based checks (circuit breakers, caching, spend tracking,
      // idempotency, concurrency) are DISABLED to stay under Cloudflare Workers'
      // 50 subrequest limit. Each Redis call = 1 subrequest.
      // Re-enable when upgrading to Workers Paid plan (1000 subrequest limit).
      
      if (data.email && isDisposableEmail(data.email)) {
        return c.json({ error: "disposable_email", message: "Please use a work or personal email address." }, 400);
      }
      
      const jobId = generateJobId();
      
      // Auto-detect category if missing
      if (!data.category || data.category === "general" || data.category.trim() === "") {
        const detected = detectBrandFromUrl(data.url);
        if (detected?.category) {
          data.category = detected.category;
        } else {
          const brandName = data.brandName || detected?.brand || "";
          const aiResult = await detectCategoryWithAI(data.url, brandName);
          data.category = aiResult.category;
        }
      }
      
      const startTime = Date.now();
      
      try {
        await markJobRunning(jobId, "Running AI queries");
        
        const result = await runAudit(data);
        
        await updateJobProgress(jobId, 80, "Saving results");
        
        const durationMs = Date.now() - startTime;
        logger.audit("completed", {
          brand: result.brandName,
          tier: result.tier,
          mode: result.mode,
          score: result.scores.overall.score,
          grade: result.scores.overall.grade,
          engines: result.scores.perEngine ? Object.keys(result.scores.perEngine).length : 0,
          durationMs,
        });
        
        // Save to database (Gap 1: mode, Gap 7: versionMetadata, Gap 16: auditMetadata, Gap 21: rawResponses)
        const saved = await storage.createAudit({
          brandName: result.brandName,
          brandUrl: result.brandUrl,
          category: result.category,
          tier: result.tier,
          mode: result.mode, // Gap 1
          language: result.language,
          overallScore: result.scores.overall.score,
          overallGrade: result.scores.overall.grade,
          confidenceLow: result.scores.overall.confidenceLow,
          confidenceHigh: result.scores.overall.confidenceHigh,
          marginOfError: String(result.scores.overall.marginOfError),
          observations: result.scores.overall.observations,
          engineResults: {
            perEngine: result.scores.perEngine,
            dimensions: result.scores.dimensions,
          },
          competitors: result.scores.competitors,
          queryResults: result.scores.queryDetails,
          sentimentData: result.scores.sentimentBreakdown,
          citationData: result.engineResults.flatMap(r => r.citations),
          geoAudit: result.geoAudit,
          recommendations: result.recommendations,
          customCompetitors: result.customCompetitors,
          rawResponses: result.rawResponses, // Gap 21
          versionMetadata: result.versionMetadata, // Gap 7
          auditMetadata: result.auditMetadata, // Gap 16
          generatedQueries: result.generatedQueries, // Dynamic queries that were run
          createdAt: new Date(),
        });
        
        // NOTE: Lead tracking, spend tracking, dedupe, and concurrency
        // Redis calls are disabled to stay under 50 subrequest limit.
        // Re-enable with Workers Paid plan.
        
        // Push lead to Attio CRM (fire-and-forget, 1 subrequest)
        if (data.email) {
          pushLeadToAttio(
            data.email,
            result.brandName,
            result.brandUrl,
            result.tier,
            result.scores.overall.score,
            saved.id
          ).catch(err => logger.error("attio_push_error", { error: err.message }));
        }
        
        return c.json({ id: saved.id, jobId, ...result });
      } catch (auditError: any) {
        throw auditError;
      }
    } catch (error: any) {
      logger.error("audit_error", { error: error.message, stack: error.stack?.slice(0, 500) });
      return c.json({ error: error.message }, 500);
    }
  });
  
  // ── Gap 5: Poll job status ────────────────────────────────────────
  api.get("/job/:jobId", async (c) => {
    try {
      const jobId = c.req.param("jobId");
      const job = await getJob(jobId);
      if (!job) return c.json({ error: "Job not found" }, 404);
      return c.json(job);
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });
  
  // ── Get a specific audit result ────────────────────────────────────
  api.get("/audit/:id", async (c) => {
    try {
      const id = parseInt(c.req.param("id"));
      const audit = await storage.getAudit(id);
      if (!audit) return c.json({ error: "Audit not found" }, 404);
      
      const engineResults = typeof audit.engineResults === 'string' ? JSON.parse(audit.engineResults) : (audit.engineResults || {});
      const competitors = typeof audit.competitors === 'string' ? JSON.parse(audit.competitors) : (audit.competitors || []);
      const queryResults = typeof audit.queryResults === 'string' ? JSON.parse(audit.queryResults) : (audit.queryResults || []);
      const sentimentData = typeof audit.sentimentData === 'string' ? JSON.parse(audit.sentimentData) : (audit.sentimentData || {});
      const citationData = typeof audit.citationData === 'string' ? JSON.parse(audit.citationData) : (audit.citationData || []);
      const geoAudit = typeof audit.geoAudit === 'string' ? JSON.parse(audit.geoAudit) : (audit.geoAudit || {});
      const recommendations = typeof audit.recommendations === 'string' ? JSON.parse(audit.recommendations) : (audit.recommendations || []);
      const customCompetitors = typeof audit.customCompetitors === 'string' ? JSON.parse(audit.customCompetitors) : (audit.customCompetitors || []);
      const versionMetadata = typeof audit.versionMetadata === 'string' ? JSON.parse(audit.versionMetadata) : (audit.versionMetadata || null);
      const auditMetadata = typeof audit.auditMetadata === 'string' ? JSON.parse(audit.auditMetadata) : (audit.auditMetadata || null);
      const generatedQueries = typeof audit.generatedQueries === 'string' ? JSON.parse(audit.generatedQueries) : (audit.generatedQueries || []);
      
      const scores = {
        overall: {
          score: audit.overallScore ?? 0,
          grade: audit.overallGrade ?? "Unknown",
          confidenceLow: audit.confidenceLow ?? 0,
          confidenceHigh: audit.confidenceHigh ?? 0,
          marginOfError: parseFloat(audit.marginOfError ?? "0"),
          observations: audit.observations ?? 0,
        },
        dimensions: engineResults.dimensions || {},
        competitors,
        sentimentBreakdown: sentimentData,
        perEngine: engineResults.perEngine || {},
        queryDetails: queryResults,
      };
      
      return c.json({
        id: audit.id,
        brandName: audit.brandName,
        brandUrl: audit.brandUrl,
        category: audit.category,
        tier: audit.tier,
        mode: (audit as any).mode || "live",
        language: audit.language,
        timestamp: audit.createdAt,
        scores,
        geoAudit,
        recommendations,
        customCompetitors,
        versionMetadata, // Gap 7
        auditMetadata,   // Gap 16
        generatedQueries, // Dynamic queries that were run
      });
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });
  
  // ── Get audit history for a brand ──────────────────────────────────
  api.get("/history/:brandName", async (c) => {
    try {
      const history = await storage.getAuditsByBrand(c.req.param("brandName"));
      return c.json(history.map(a => ({
        id: a.id,
        brandName: a.brandName,
        overallScore: a.overallScore,
        overallGrade: a.overallGrade,
        tier: a.tier,
        mode: (a as any).mode || "live",
        createdAt: a.createdAt,
      })));
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });
  
  // ── Recent audits ──────────────────────────────────────────────────
  api.get("/recent", async (c) => {
    try {
      const recent = await storage.getRecentAudits(10);
      return c.json(recent.map(a => ({
        id: a.id,
        brandName: a.brandName,
        brandUrl: a.brandUrl,
        category: a.category,
        overallScore: a.overallScore,
        overallGrade: a.overallGrade,
        mode: (a as any).mode || "live",
        createdAt: a.createdAt,
      })));
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });
  
  // ── Gap 12: GDPR deletion endpoint ────────────────────────────────
  api.delete("/gdpr/delete", async (c) => {
    try {
      const { email } = await c.req.json();
      if (!email || typeof email !== "string" || !email.includes("@")) {
        return c.json({ error: "Valid email required" }, 400);
      }
      
      logger.info("gdpr_delete_request", { email });
      
      // Use raw DB access for the deletion
      const { getDb } = await import("./storage");
      const db = getDb();
      const result = await deleteUserData(email, db);
      
      logger.info("gdpr_delete_completed", { email, ...result });
      
      return c.json({
        status: "deleted",
        email,
        ...result,
        retentionPolicy: RETENTION_DAYS,
      });
    } catch (error: any) {
      logger.error("gdpr_delete_error", { error: error.message });
      return c.json({ error: error.message }, 500);
    }
  });
  
  // ── Gap 14: Scheduler trigger endpoint (called by QStash) ─────────
  api.post("/scheduler/trigger", async (c) => {
    try {
      const body = await c.req.json();
      const { scheduleId, brandName, brandUrl, category, tier, email, mode } = body;
      
      if (!scheduleId) return c.json({ error: "scheduleId required" }, 400);
      
      const schedule = await getSchedule(scheduleId);
      if (!schedule || !schedule.enabled) {
        return c.json({ error: "Schedule not found or disabled" }, 404);
      }
      
      logger.info("scheduler_trigger", { scheduleId, brandName, tier });
      
      // Run the benchmark audit
      const result = await runAudit({
        url: brandUrl || schedule.brandUrl,
        brandName: brandName || schedule.brandName,
        category: category || schedule.category,
        tier: tier || schedule.tier,
        mode: "benchmark",
        email: email || schedule.email,
        language: "en",
      });
      
      // Save to DB
      const saved = await storage.createAudit({
        brandName: result.brandName,
        brandUrl: result.brandUrl,
        category: result.category,
        tier: result.tier,
        mode: "benchmark",
        language: result.language,
        overallScore: result.scores.overall.score,
        overallGrade: result.scores.overall.grade,
        confidenceLow: result.scores.overall.confidenceLow,
        confidenceHigh: result.scores.overall.confidenceHigh,
        marginOfError: String(result.scores.overall.marginOfError),
        observations: result.scores.overall.observations,
        engineResults: { perEngine: result.scores.perEngine, dimensions: result.scores.dimensions },
        competitors: result.scores.competitors,
        queryResults: result.scores.queryDetails,
        sentimentData: result.scores.sentimentBreakdown,
        citationData: result.engineResults.flatMap(r => r.citations),
        geoAudit: result.geoAudit,
        recommendations: result.recommendations,
        customCompetitors: result.customCompetitors,
        rawResponses: result.rawResponses,
        versionMetadata: result.versionMetadata,
        auditMetadata: result.auditMetadata,
        generatedQueries: result.generatedQueries,
        createdAt: new Date(),
      });
      
      // Record the run
      await recordScheduleRun(scheduleId, result.scores.overall.score);
      
      return c.json({ status: "ok", auditId: saved.id, score: result.scores.overall.score });
    } catch (error: any) {
      logger.error("scheduler_trigger_error", { error: error.message });
      return c.json({ error: error.message }, 500);
    }
  });
  
  // ── Gap 14: Get schedules for an email ────────────────────────────
  api.get("/schedules/:email", async (c) => {
    try {
      const email = c.req.param("email");
      const schedules = await getSchedulesForEmail(email);
      return c.json(schedules);
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });
  
  // ── Debug: test API key availability ──────────────────────────────
  api.get("/debug/keys", async (c) => {
    return c.json({
      openai: process.env.OPENAI_API_KEY ? `set (${process.env.OPENAI_API_KEY.slice(0,8)}...)` : "NOT SET",
      gemini: process.env.GOOGLE_GEMINI_API_KEY ? `set (${process.env.GOOGLE_GEMINI_API_KEY.slice(0,8)}...)` : "NOT SET",
      anthropic: process.env.ANTHROPIC_API_KEY ? `set (${process.env.ANTHROPIC_API_KEY.slice(0,8)}...)` : "NOT SET",
      xai: process.env.XAI_API_KEY ? `set (${process.env.XAI_API_KEY.slice(0,8)}...)` : "NOT SET",
      perplexity: process.env.PERPLEXITY_API_KEY ? `set (${process.env.PERPLEXITY_API_KEY.slice(0,8)}...)` : "NOT SET",
    });
  });

  // ── Debug: test ALL AI engines with real API calls ─────────────────
  api.get("/debug/test-engines", async (c) => {
    const results: Record<string, any> = {};
    const testPrompt = "Name 3 popular yoga brands";
    
    // Helper: test OpenAI-compatible endpoint
    async function testOpenAI(name: string, baseUrl: string, keyEnv: string, model: string) {
      try {
        const key = process.env[keyEnv];
        if (!key) { results[name] = { error: "no key" }; return; }
        const r = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
          body: JSON.stringify({ model, messages: [{ role: "user", content: testPrompt }], max_tokens: 100 }),
        });
        const data = await r.json() as any;
        if (!r.ok) { results[name] = { error: data.error?.message || `HTTP ${r.status}`, status: r.status }; }
        else { results[name] = { ok: true, model, response: (data.choices?.[0]?.message?.content || "").slice(0, 200) }; }
      } catch (e: any) { results[name] = { error: e.message }; }
    }
    
    // Test all 5 engines in parallel
    await Promise.allSettled([
      testOpenAI("chatgpt", "https://api.openai.com/v1", "OPENAI_API_KEY", "gpt-4o-mini"),
      // Gemini (different API format)
      (async () => {
        try {
          const key = process.env.GOOGLE_GEMINI_API_KEY;
          if (!key) { results.gemini = { error: "no key" }; return; }
          const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: testPrompt }] }], generationConfig: { maxOutputTokens: 100 } }),
          });
          const data = await r.json() as any;
          if (!r.ok) { results.gemini = { error: data.error?.message || `HTTP ${r.status}`, status: r.status }; }
          else { results.gemini = { ok: true, model: "gemini-2.5-flash", response: (data.candidates?.[0]?.content?.parts?.[0]?.text || "").slice(0, 200) }; }
        } catch (e: any) { results.gemini = { error: e.message }; }
      })(),
      // Claude (Anthropic API format)
      (async () => {
        try {
          const key = process.env.ANTHROPIC_API_KEY;
          if (!key) { results.claude = { error: "no key" }; return; }
          const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 100, messages: [{ role: "user", content: testPrompt }] }),
          });
          const data = await r.json() as any;
          if (!r.ok) { results.claude = { error: data.error?.message || `HTTP ${r.status}`, status: r.status }; }
          else { results.claude = { ok: true, model: "claude-haiku-4-5", response: (data.content?.map((c: any) => c.text).join("") || "").slice(0, 200) }; }
        } catch (e: any) { results.claude = { error: e.message }; }
      })(),
      testOpenAI("grok", "https://api.x.ai/v1", "XAI_API_KEY", "grok-3-mini"),
      testOpenAI("perplexity", "https://api.perplexity.ai", "PERPLEXITY_API_KEY", "sonar"),
    ]);
    
    return c.json(results);
  });

  // ── Debug: test DB insert ───────────────────────────────────
  api.get("/debug/test-insert", async (c) => {
    const results: Record<string, any> = {};
    
    try {
      // Test 1: Simple insert
      results.step1 = "Attempting simple insert...";
      const simple = await storage.createAudit({
        brandName: "DBTest",
        brandUrl: "https://test.example.com",
        category: "test",
        tier: "snapshot",
        mode: "live",
        language: "en",
        overallScore: 42,
        overallGrade: "Average",
        confidenceLow: 30,
        confidenceHigh: 55,
        marginOfError: "12.5",
        observations: 10,
        engineResults: { test: true },
        competitors: [{ name: "TestComp" }],
        queryResults: [{ query: "test" }],
        sentimentData: { positive: 1 },
        citationData: [],
        geoAudit: { test: true },
        recommendations: [],
        customCompetitors: [],
        createdAt: new Date(),
      });
      results.step1 = `OK - id: ${simple.id}`;
      
      // Test 2: Insert with generatedQueries
      results.step2 = "Attempting insert with generatedQueries...";
      const withQueries = await storage.createAudit({
        brandName: "DBTest2",
        brandUrl: "https://test2.example.com",
        category: "test",
        tier: "snapshot",
        mode: "live",
        language: "en",
        overallScore: 55,
        overallGrade: "Average",
        confidenceLow: 40,
        confidenceHigh: 70,
        marginOfError: "15",
        observations: 12,
        engineResults: { test: true },
        competitors: [],
        queryResults: [],
        sentimentData: {},
        citationData: [],
        geoAudit: {},
        recommendations: [],
        customCompetitors: [],
        rawResponses: [{ engine: "test", response: "hello" }],
        versionMetadata: { version: "1.0" },
        auditMetadata: { totalDurationMs: 100 },
        generatedQueries: [{ query: "test query", intent: "research" }],
        createdAt: new Date(),
      });
      results.step2 = `OK - id: ${withQueries.id}`;
      
      results.status = "ALL INSERTS OK";
    } catch (err: any) {
      results.error = err.message?.slice(0, 500);
      results.code = err.code;
      results.detail = err.detail;
    }
    
    return c.json(results);
  });

  // ── Admin: system status ───────────────────────────────────────────
  api.get("/admin/status", async (c) => {
    try {
      const [circuits, todaySpend] = await Promise.all([
        getAllCircuitStates(),
        getTodaySpend(),
      ]);
      // Cache stats is best-effort (can be slow)
      let cacheStats = null;
      try { cacheStats = await getCacheStats(); } catch {}
      return c.json({
        version: "2.2.0",
        providers: circuits,
        spend: {
          todayCents: Math.round(todaySpend * 100) / 100,
          todayDollars: `$${(todaySpend / 100).toFixed(2)}`,
          ceilingDollars: "$2.00",
        },
        cache: cacheStats,
        retentionPolicy: RETENTION_DAYS,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });
  
  // ── Admin: reset circuit breakers ────────────────────────────
  api.post("/admin/reset-circuits", async (c) => {
    try {
      const { Redis } = await import("@upstash/redis");
      const url = process.env.UPSTASH_REDIS_REST_URL;
      const token = process.env.UPSTASH_REDIS_REST_TOKEN;
      if (!url || !token) return c.json({ error: "Redis not configured" }, 500);
      const redis = new Redis({ url, token });
      
      const providers = ["chatgpt", "gemini", "claude", "grok", "perplexity"];
      for (const p of providers) {
        await redis.del(`asov:circuit:${p}:failures`);
        await redis.del(`asov:circuit:${p}:last_failure`);
      }
      
      return c.json({ status: "ok", message: "All circuit breakers reset", providers });
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });

  // ── Admin: cleanup expired data ───────────────────────────────────
  api.post("/admin/cleanup", async (c) => {
    try {
      const { getDb } = await import("./storage");
      const db = getDb();
      const result = await cleanupExpiredAudits(db);
      return c.json({ status: "ok", ...result });
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });

  return api;
}
