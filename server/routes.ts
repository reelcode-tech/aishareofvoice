import { Hono } from "hono";
import { type IStorage } from "./storage";
import { runAudit } from "./engine/audit-runner";
import { detectBrandFromUrl, detectCategoryWithAI } from "./engine/brand-detection";
import { discoverCompetitors } from "./engine/competitor-discovery";
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
const MAX_SNAPSHOT_AUDITS_PER_EMAIL = 3;
// Max audits per IP per hour (without email)
const MAX_AUDITS_PER_IP_HOUR = 5;

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
      
      // ── Layer 1: Disposable email check ──
      if (data.email && isDisposableEmail(data.email)) {
        return c.json({ error: "disposable_email", message: "Please use a work or personal email address." }, 400);
      }
      
      // ── Layer 1b: Multi-tenancy check for paid tiers (Gap 13) ──
      if (data.tier !== "snapshot") {
        const tierAccess = await validateTierAccess(data.email, data.tier);
        if (!tierAccess.allowed) {
          return c.json({ error: "tier_access_denied", message: tierAccess.reason }, 403);
        }
      }
      
      // ── Layer 2: Email gate for snapshot tier ONLY ──
      if (data.tier === "snapshot") {
        if (!data.email) {
          return c.json({ error: "email_required", message: "Email is required to run a free audit." }, 403);
        }
        const lead = await storage.getOrCreateLead(data.email);
        if (lead.auditCount >= MAX_SNAPSHOT_AUDITS_PER_EMAIL) {
          return c.json({
            error: "email_limit_reached",
            message: `You've used all ${MAX_SNAPSHOT_AUDITS_PER_EMAIL} free audits. Upgrade to Monitor for unlimited audits.`,
            auditCount: lead.auditCount,
          }, 429);
        }
        
        // ── Layer 2b: Progressive throttling ──
        const throttle = await checkProgressiveThrottle(data.email, lead.auditCount);
        if (!throttle.allowed) {
          return c.json({
            error: "throttled",
            message: `Please wait ${throttle.waitSeconds} seconds before running another audit.`,
            waitSeconds: throttle.waitSeconds,
          }, 429);
        }
      }
      
      // ── Layer 3: IP rate limiting (snapshot only) ──
      if (data.tier === "snapshot") {
        const ipCheck = await storage.checkIpLimit(ip, MAX_AUDITS_PER_IP_HOUR, 60);
        if (!ipCheck.allowed) {
          return c.json({ error: "rate_limited", message: "Too many audits from this location. Try again in an hour." }, 429);
        }
      }
      
      // ── Layer 4: Concurrent audit limit ──
      if (data.email) {
        const concurrent = await checkConcurrentLimit(data.email);
        if (!concurrent.allowed) {
          return c.json({ error: "concurrent_limit", message: "An audit is already running for this account. Please wait for it to complete." }, 429);
        }
      }
      
      // ── Layer 4b: Global concurrency check (Gap 2) ──
      const capacity = await checkGlobalCapacity(data.tier);
      if (!capacity.allowed) {
        return c.json({
          error: "system_busy",
          message: "System is at capacity. Higher-tier audits are being prioritized. Please try again in a few minutes.",
          currentLoad: capacity.currentWeight,
        }, 503);
      }
      
      // ── Layer 5: Idempotency / dedupe check ──
      // Only dedupe in live mode; benchmarks are always unique
      const dedupeParams = {
        url: data.url,
        brandName: data.brandName,
        tier: data.tier,
        language: data.language,
        email: data.email,
      };
      
      if (data.mode === "live") {
        const dedupe = await checkDedupe(dedupeParams);
        if (dedupe.deduplicated && dedupe.existingAuditId) {
          logger.audit("deduplicated", { existingAuditId: dedupe.existingAuditId });
          const existingAudit = await storage.getAudit(dedupe.existingAuditId);
          if (existingAudit) {
            return c.json({ id: existingAudit.id, deduplicated: true, message: "This audit was already run recently. Returning cached result." });
          }
        }
      }
      
      // ── Layer 6: Daily spend ceiling ──
      const budget = await checkSpendBudget(data.tier);
      if (!budget.allowed) {
        logger.warn("spend_ceiling_hit", { tier: data.tier, currentSpend: budget.currentSpendCents });
        return c.json({ error: "budget_exhausted", message: budget.reason }, 503);
      }
      
      // ── All checks passed — run audit ──
      
      // Gap 5: Create async job
      const jobId = generateJobId();
      await createJob(jobId, data.url, data.tier, data.brandName);
      
      // Mark in-flight for dedupe
      await markInFlight(dedupeParams);
      
      // Gap 2: Acquire global weight
      await acquireGlobalWeight(data.tier);
      
      // Mark concurrent
      if (data.email) await incrementConcurrent(data.email);
      if (data.email) await recordAuditTimestamp(data.email);
      
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
          createdAt: new Date(),
        });
        
        // Track lead usage + IP (snapshot only)
        if (data.tier === "snapshot" && data.email) {
          await storage.incrementLeadAuditCount(data.email);
          await storage.incrementIpCount(ip);
        }
        
        // Record spend
        await recordAuditSpend(
          data.tier,
          result.engineResults.length > 0 ? Math.ceil(result.engineResults.length / 2) : 12,
          result.scores.perEngine ? Object.keys(result.scores.perEngine).length : 2,
        );
        
        // Mark dedupe as completed
        await markCompleted(dedupeParams, saved.id);
        
        // Gap 5: Mark job completed
        await markJobCompleted(jobId, saved.id);
        
        // Gap 13: Record org audit if applicable
        if (data.email && data.tier !== "snapshot") {
          const tierAccess = await validateTierAccess(data.email, data.tier);
          if (tierAccess.org) {
            await recordOrgAudit(tierAccess.org.orgId);
          }
        }
        
        return c.json({ id: saved.id, jobId, ...result });
      } catch (auditError: any) {
        await markJobFailed(jobId, auditError.message);
        throw auditError;
      } finally {
        // Always release locks
        if (data.email) await decrementConcurrent(data.email);
        await releaseGlobalWeight(data.tier); // Gap 2
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
