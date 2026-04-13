import { Hono } from "hono";
import { type IStorage } from "./storage";
import { runAudit } from "./engine/audit-runner";
import { detectBrandFromUrl, detectCategoryWithAI } from "./engine/brand-detection";
import { discoverCompetitors } from "./engine/competitor-discovery";
import { pushLeadToAttio } from "./engine/attio";
import { auditRequestSchema, type InsertManualPromptTask } from "@shared/schema";
import { getEnginesForTier, getBrandExtractionSystemPrompt, extractBrands, analyzeSentiment, extractCitations, type EngineResult } from "./engine/ai-engines";
import { generateQueries } from "./engine/query-generator";
import { deduplicateQueries } from "./engine/query-dedup";
import { calculateScores } from "./engine/scoring";
import { runGeoAudit } from "./engine/geo-audit";
import { generateRecommendations } from "./engine/recommendations";
import { buildVersionMetadata } from "./engine/versioning";
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
      
      // ── Manual mode: generate prompts without calling AI engines ──
      if (data.mode === "manual") {
        try {
          // Step 1: Generate queries (this calls Claude Haiku — cheap intelligence task)
          const rawQueries = await generateQueries(
            data.brandName || "Unknown",
            data.category || "general",
            data.customCompetitors || [],
            data.tier as "snapshot" | "monitor" | "agency",
            data.language || "en",
          );
          const queries = deduplicateQueries(rawQueries);
          
          // Step 2: Get engines for this tier
          const engines = getEnginesForTier(data.tier);
          const systemPrompt = getBrandExtractionSystemPrompt(data.category || "general");
          
          // Step 3: Create placeholder audit record
          const saved = await storage.createAudit({
            brandName: data.brandName || "Unknown",
            brandUrl: data.url,
            category: data.category || "general",
            tier: data.tier,
            mode: "manual" as any,
            language: data.language || "en",
            overallScore: null as any,
            overallGrade: "Pending Manual",
            engineResults: {},
            competitors: [],
            queryResults: [],
            sentimentData: {},
            citationData: [],
            geoAudit: {},
            recommendations: [],
            customCompetitors: data.customCompetitors || [],
            generatedQueries: queries,
            createdAt: new Date(),
          });
          
          // Step 4: Create prompt queue entries for each engine × query
          const promptTasks: InsertManualPromptTask[] = engines.flatMap(engine =>
            queries.map(q => ({
              auditId: saved.id,
              engine: engine.name.toLowerCase(),
              query: q.query,
              systemPrompt,
              status: "pending" as const,
            }))
          );
          
          await storage.createPromptTasks(promptTasks);
          
          return c.json({
            id: saved.id,
            mode: "manual",
            status: "pending_manual",
            promptCount: promptTasks.length,
            engines: engines.map(e => e.name),
            queryCount: queries.length,
            adminUrl: `/api/admin/queue/page`,
            message: `${promptTasks.length} prompts queued. Go to the admin queue to paste responses from your AI subscriptions.`,
          });
        } catch (error: any) {
          logger.error("manual_audit_error", { error: error.message });
          return c.json({ error: error.message }, 500);
        }
      }
      
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

  // ── Manual paste mode: admin queue ──────────────────────────────────
  // Submit audit with mode="manual" → generates prompts but skips API calls
  // Admin pastes responses from subscription apps → feeds into scoring pipeline

  // List all prompt tasks (optionally filter by audit_id)
  api.get("/admin/queue", async (c) => {
    try {
      const auditIdParam = c.req.query("audit_id");
      const showAll = c.req.query("all") === "true";
      if (auditIdParam) {
        const tasks = await storage.getPromptTasksByAudit(parseInt(auditIdParam));
        return c.json({ tasks });
      }
      // When showAll or loading for the admin page, return all tasks
      // Otherwise return only pending
      if (showAll) {
        // Get all tasks from recent audits
        const { getDb } = await import("./storage");
        const db = getDb();
        const { manualPromptQueue } = await import("@shared/schema");
        const { desc } = await import("drizzle-orm");
        const tasks = await db.select().from(manualPromptQueue).orderBy(desc(manualPromptQueue.id)).limit(500);
        return c.json({ tasks });
      }
      const tasks = await storage.getPendingPromptTasks();
      return c.json({ tasks });
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });

  // Submit a pasted response for a specific prompt task
  api.post("/admin/queue/:id/response", async (c) => {
    try {
      const id = parseInt(c.req.param("id"));
      const { response } = await c.req.json();
      if (!response || typeof response !== "string") {
        return c.json({ error: "Response text required" }, 400);
      }
      const task = await storage.submitPromptResponse(id, response);
      return c.json({ task });
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });

  // Complete a manual audit — process all pasted responses through scoring
  api.post("/admin/queue/audit/:auditId/complete", async (c) => {
    try {
      const auditId = parseInt(c.req.param("auditId"));
      const tasks = await storage.getPromptTasksByAudit(auditId);
      
      if (tasks.length === 0) {
        return c.json({ error: "No prompt tasks found for this audit" }, 404);
      }
      
      const pending = tasks.filter(t => t.status === "pending");
      if (pending.length > 0) {
        return c.json({ error: `${pending.length} responses still pending`, pending: pending.map(t => t.id) }, 400);
      }
      
      // Get the audit to retrieve brand/category info
      const audit = await storage.getAudit(auditId);
      if (!audit) {
        return c.json({ error: "Audit not found" }, 404);
      }
      
      const targetBrand = audit.brandName;
      const category = audit.category;
      
      // Process each response through the extraction pipeline
      const engineResults: EngineResult[] = tasks.map(task => {
        const response = task.response || "";
        const { mentionsBrand, mentionedBrands } = extractBrands(response, targetBrand);
        const sentiment = analyzeSentiment(response, targetBrand);
        const citations = extractCitations(response);
        
        return {
          engine: task.engine.charAt(0).toUpperCase() + task.engine.slice(1), // Capitalize
          model: "manual-paste",
          query: task.query,
          response,
          mentionsBrand,
          mentionedBrands,
          sentiment,
          citations,
          timestamp: (task.completedAt || new Date()).toISOString(),
        } as EngineResult;
      });
      
      // Run geo audit
      const geoAudit = await runGeoAudit(audit.brandUrl);
      
      // Calculate scores
      const customCompetitors = (audit.customCompetitors as string[]) || [];
      const scores = calculateScores(targetBrand, category, engineResults, geoAudit, customCompetitors);
      
      // Generate recommendations
      const recommendations = generateRecommendations(
        targetBrand, category, geoAudit, scores, audit.tier
      );
      
      // Build version metadata
      const engineModels: Record<string, string> = {};
      for (const task of tasks) {
        engineModels[task.engine] = "manual-paste";
      }
      const versionMetadata = buildVersionMetadata(
        audit.tier, engineModels, tasks.length, Object.keys(engineModels).length, audit.language, "live"
      );
      
      // Update the audit record with results
      const updated = await storage.createAudit({
        brandName: audit.brandName,
        brandUrl: audit.brandUrl,
        category: audit.category,
        tier: audit.tier,
        mode: "manual" as any,
        language: audit.language,
        overallScore: scores.overall.score,
        overallGrade: scores.overall.grade,
        confidenceLow: scores.overall.confidenceLow,
        confidenceHigh: scores.overall.confidenceHigh,
        marginOfError: String(scores.overall.marginOfError),
        observations: scores.overall.observations,
        engineResults: { perEngine: scores.perEngine, dimensions: scores.dimensions },
        competitors: scores.competitors,
        queryResults: scores.queryDetails,
        sentimentData: scores.sentimentBreakdown,
        citationData: engineResults.flatMap(r => r.citations),
        geoAudit,
        recommendations,
        customCompetitors,
        rawResponses: engineResults.map(r => ({
          engine: r.engine, model: r.model, query: r.query,
          response: r.response, timestamp: r.timestamp,
        })),
        versionMetadata,
        auditMetadata: {
          totalDurationMs: 0,
          queryGenDurationMs: 0,
          queryDurationMs: 0,
          geoDurationMs: 0,
          scoringDurationMs: 0,
          queryCount: tasks.length,
          queryCountBeforeDedup: tasks.length,
          queryCountAfterDedup: tasks.length,
          engineCount: Object.keys(engineModels).length,
          totalApiCalls: 0,
          cacheHits: 0,
          cacheMisses: 0,
          estimatedCostCents: 0,
        },
        generatedQueries: (audit.generatedQueries as any) || [],
        createdAt: new Date(),
      });
      
      return c.json({
        status: "completed",
        auditId: updated.id,
        score: scores.overall.score,
        grade: scores.overall.grade,
        observations: scores.overall.observations,
        enginesProcessed: Object.keys(engineModels).length,
        responsesProcessed: tasks.length,
      });
    } catch (error: any) {
      logger.error("manual_complete_error", { error: error.message });
      return c.json({ error: error.message }, 500);
    }
  });

  // Serve admin queue HTML page
  api.get("/admin/queue/page", async (c) => {
    return c.html(getAdminQueueHtml());
  });

  return api;
}

// ── Admin Queue HTML ─────────────────────────────────────────────────
function getAdminQueueHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ASOV Admin — Manual Paste Queue</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f0f; color: #e0e0e0; padding: 20px; }
    h1 { color: #fff; margin-bottom: 8px; font-size: 24px; }
    .subtitle { color: #888; margin-bottom: 24px; font-size: 14px; }
    .controls { display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; align-items: center; }
    .controls input, .controls select { background: #1a1a1a; border: 1px solid #333; color: #e0e0e0; padding: 8px 12px; border-radius: 6px; font-size: 14px; }
    .controls button { background: #2563eb; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; }
    .controls button:hover { background: #1d4ed8; }
    .controls button.secondary { background: #333; }
    .controls button.secondary:hover { background: #444; }
    .controls button.success { background: #16a34a; }
    .controls button.success:hover { background: #15803d; }
    .audit-group { margin-bottom: 32px; border: 1px solid #222; border-radius: 8px; overflow: hidden; }
    .audit-header { background: #1a1a1a; padding: 16px; display: flex; justify-content: space-between; align-items: center; }
    .audit-header h3 { font-size: 16px; color: #fff; }
    .audit-header .badge { background: #333; color: #aaa; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
    .audit-header .badge.done { background: #16a34a33; color: #4ade80; }
    .task-card { padding: 16px; border-top: 1px solid #222; }
    .task-meta { display: flex; gap: 12px; align-items: center; margin-bottom: 8px; }
    .engine-badge { padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
    .engine-gemini { background: #4285f433; color: #8ab4f8; }
    .engine-chatgpt { background: #10a37f33; color: #4ade80; }
    .engine-claude { background: #d97f0033; color: #fbbf24; }
    .engine-grok { background: #1d9bf033; color: #60a5fa; }
    .engine-perplexity { background: #6366f133; color: #a5b4fc; }
    .prompt-box { background: #111; border: 1px solid #333; border-radius: 6px; padding: 12px; margin: 8px 0; font-size: 13px; position: relative; white-space: pre-wrap; word-break: break-word; max-height: 120px; overflow-y: auto; }
    .copy-btn { position: absolute; top: 8px; right: 8px; background: #2563eb; color: #fff; border: none; padding: 4px 10px; border-radius: 4px; font-size: 11px; cursor: pointer; }
    .copy-btn:hover { background: #1d4ed8; }
    .response-area { width: 100%; min-height: 100px; background: #111; border: 1px solid #333; border-radius: 6px; padding: 12px; color: #e0e0e0; font-size: 13px; margin: 8px 0; resize: vertical; }
    .submit-btn { background: #2563eb; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; }
    .submit-btn:hover { background: #1d4ed8; }
    .submit-btn:disabled { background: #333; cursor: not-allowed; }
    .status-done { color: #4ade80; font-size: 12px; }
    .engine-links { display: flex; gap: 8px; margin-bottom: 16px; }
    .engine-link { display: inline-flex; align-items: center; gap: 6px; background: #1a1a1a; border: 1px solid #333; padding: 6px 12px; border-radius: 6px; color: #60a5fa; text-decoration: none; font-size: 13px; }
    .engine-link:hover { background: #222; }
    .loading { text-align: center; padding: 40px; color: #888; }
    .error { color: #ef4444; background: #ef444420; padding: 12px; border-radius: 6px; margin: 12px 0; }
    .empty { text-align: center; padding: 60px; color: #666; }
    .complete-btn { background: #16a34a; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; }
    .complete-btn:hover { background: #15803d; }
    .complete-btn:disabled { background: #333; cursor: not-allowed; }
    .system-prompt-toggle { color: #666; font-size: 11px; cursor: pointer; text-decoration: underline; }
    .system-prompt { display: none; background: #0a0a0a; border: 1px solid #222; border-radius: 4px; padding: 8px; margin-top: 4px; font-size: 11px; color: #666; }
  </style>
</head>
<body>
  <h1>📋 Manual Paste Queue</h1>
  <p class="subtitle">Paste responses from your AI subscriptions to validate the scoring pipeline at zero API cost</p>

  <div class="engine-links">
    <a class="engine-link" href="https://chat.openai.com" target="_blank">🟢 ChatGPT</a>
    <a class="engine-link" href="https://gemini.google.com" target="_blank">🔵 Gemini</a>
    <a class="engine-link" href="https://claude.ai" target="_blank">🟠 Claude</a>
    <a class="engine-link" href="https://x.com/i/grok" target="_blank">⚪ Grok</a>
    <a class="engine-link" href="https://perplexity.ai" target="_blank">🟣 Perplexity</a>
  </div>

  <div class="controls">
    <button onclick="loadQueue()" class="secondary">Refresh</button>
    <span id="stats" style="color: #888; font-size: 13px;"></span>
  </div>

  <div id="queue-container">
    <div class="loading">Loading queue...</div>
  </div>

  <script>
    const API = '/api';
    let allTasks = [];

    async function loadQueue() {
      const container = document.getElementById('queue-container');
      try {
        const res = await fetch(API + '/admin/queue?all=true');
        const data = await res.json();
        allTasks = data.tasks || [];
        
        if (allTasks.length === 0) {
          container.innerHTML = '<div class="empty">No manual audit tasks in queue.<br><br>Run an audit with <code>mode: "manual"</code> to generate prompt tasks.</div>';
          return;
        }
        
        // Group by audit_id
        const grouped = {};
        for (const task of allTasks) {
          if (!grouped[task.auditId]) grouped[task.auditId] = [];
          grouped[task.auditId].push(task);
        }
        
        let html = '';
        for (const [auditId, tasks] of Object.entries(grouped)) {
          const completed = tasks.filter(t => t.status === 'completed').length;
          const total = tasks.length;
          const allDone = completed === total;
          
          html += '<div class="audit-group">';
          html += '<div class="audit-header">';
          html += '<h3>Audit #' + auditId + '</h3>';
          html += '<div style="display:flex;gap:8px;align-items:center;">';
          html += '<span class="badge ' + (allDone ? 'done' : '') + '">' + completed + '/' + total + ' done</span>';
          if (allDone) {
            html += '<button class="complete-btn" onclick="completeAudit(' + auditId + ')">Complete Audit \u2192 Score</button>';
          }
          html += '</div></div>';
          
          for (const task of tasks) {
            const engineClass = 'engine-' + task.engine;
            html += '<div class="task-card" id="task-' + task.id + '">';
            html += '<div class="task-meta">';
            html += '<span class="engine-badge ' + engineClass + '">' + task.engine + '</span>';
            if (task.status === 'completed') {
              html += '<span class="status-done">\u2713 Response submitted</span>';
            }
            html += '</div>';
            
            // Prompt to copy
            html += '<div class="prompt-box">';
            html += '<button class="copy-btn" onclick="copyPrompt(this)">Copy</button>';
            html += escapeHtml(task.query);
            html += '</div>';
            
            // System prompt toggle
            html += '<span class="system-prompt-toggle" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display===\\"block\\"?\\"none\\":\\"block\\"">Show system prompt</span>';
            html += '<div class="system-prompt">' + escapeHtml(task.systemPrompt) + '</div>';
            
            if (task.status === 'pending') {
              html += '<textarea class="response-area" id="response-' + task.id + '" placeholder="Paste the AI response here..."></textarea>';
              html += '<button class="submit-btn" onclick="submitResponse(' + task.id + ')">Submit Response</button>';
            } else {
              html += '<div class="prompt-box" style="border-color:#16a34a33;">' + escapeHtml(task.response || '(empty)') + '</div>';
            }
            
            html += '</div>';
          }
          html += '</div>';
        }
        
        container.innerHTML = html;
        document.getElementById('stats').textContent = allTasks.length + ' total tasks, ' + allTasks.filter(t => t.status === 'pending').length + ' pending';
      } catch (err) {
        container.innerHTML = '<div class="error">Error loading queue: ' + err.message + '</div>';
      }
    }

    function copyPrompt(btn) {
      const text = btn.parentElement.textContent.replace('Copy', '').trim();
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy', 1500);
      });
    }

    function escapeHtml(str) {
      return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    async function submitResponse(taskId) {
      const textarea = document.getElementById('response-' + taskId);
      const response = textarea.value.trim();
      if (!response) { alert('Please paste a response first'); return; }
      
      const btn = textarea.nextElementSibling;
      btn.disabled = true;
      btn.textContent = 'Submitting...';
      
      try {
        const res = await fetch(API + '/admin/queue/' + taskId + '/response', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ response }),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        loadQueue();
      } catch (err) {
        alert('Error: ' + err.message);
        btn.disabled = false;
        btn.textContent = 'Submit Response';
      }
    }

    async function completeAudit(auditId) {
      if (!confirm('Process all responses and generate scores for Audit #' + auditId + '?')) return;
      
      try {
        const res = await fetch(API + '/admin/queue/audit/' + auditId + '/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
        alert('Audit completed! Score: ' + data.score + ' (' + data.grade + ') — ' + data.responsesProcessed + ' responses processed');
        loadQueue();
      } catch (err) {
        alert('Error completing audit: ' + err.message);
      }
    }

    loadQueue();
  </script>
</body>
</html>`;
}
