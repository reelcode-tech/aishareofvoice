import { Hono } from "hono";
import { type IStorage } from "./storage";
import { runAudit } from "./engine/audit-runner";
import { detectBrandFromUrl, detectCategoryWithAI } from "./engine/brand-detection";
import { discoverCompetitors } from "./engine/competitor-discovery";
import { auditRequestSchema } from "@shared/schema";

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

  // Detect brand from URL
  api.post("/detect", async (c) => {
    try {
      const { url } = await c.req.json();
      if (!url) return c.json({ error: "URL required" }, 400);
      
      const detected = detectBrandFromUrl(url);
      if (!detected) {
        return c.json({ brand: "Unknown", category: "general", categoryConfidence: "low", categoryReason: "Could not identify brand from URL", categorySource: "ai_inferred" });
      }
      
      if (detected.category) {
        return c.json({ ...detected, categoryConfidence: "high", categoryReason: `${detected.brand} is a well-known brand in this space`, categorySource: "known_domain" });
      }
      
      console.log(`[Detect] Unknown domain, using AI to infer category for ${detected.brand}`);
      const aiResult = await detectCategoryWithAI(url, detected.brand);
      console.log(`[Detect] AI inferred category: "${aiResult.category}" (${aiResult.confidence})`);
      
      return c.json({ brand: detected.brand, category: aiResult.category, categoryConfidence: aiResult.confidence, categoryReason: aiResult.reason, categorySource: aiResult.source });
    } catch (error: any) {
      console.error("[Detect Error]", error);
      return c.json({ error: error.message }, 500);
    }
  });
  
  // Combined detect + competitor discovery
  api.post("/detect-all", async (c) => {
    try {
      const { url } = await c.req.json();
      if (!url) return c.json({ error: "URL required" }, 400);
      
      const detected = detectBrandFromUrl(url);
      const brand = detected?.brand || "Unknown";
      
      if (detected?.category) {
        console.log(`[DetectAll] Known domain ${brand} in ${detected.category}, fetching competitors...`);
        const competitors = await discoverCompetitors(brand, detected.category, url);
        return c.json({
          brand, category: detected.category,
          categoryConfidence: "high",
          categoryReason: `${brand} is a well-known brand in this space`,
          categorySource: "known_domain",
          competitors,
        });
      }
      
      console.log(`[DetectAll] Unknown domain — detecting category for ${brand}...`);
      const aiResult = await detectCategoryWithAI(url, brand);
      console.log(`[DetectAll] Category detected: "${aiResult.category}" (${aiResult.confidence}). Now discovering competitors...`);
      
      const competitors = await discoverCompetitors(brand, aiResult.category || "general", url);
      console.log(`[DetectAll] Found ${competitors.length} competitors`);
      
      return c.json({
        brand, category: aiResult.category,
        categoryConfidence: aiResult.confidence,
        categoryReason: aiResult.reason,
        categorySource: aiResult.source,
        competitors,
      });
    } catch (error: any) {
      console.error("[DetectAll Error]", error);
      return c.json({ error: error.message }, 500);
    }
  });

  // Discover competitors
  api.post("/discover-competitors", async (c) => {
    try {
      const { brandName, category, url } = await c.req.json();
      if (!brandName) return c.json({ error: "Brand name required" }, 400);
      
      const cat = category || "general";
      console.log(`[Discover] Finding competitors for ${brandName} in ${cat}`);
      const competitors = await discoverCompetitors(brandName, cat, url);
      console.log(`[Discover] Found ${competitors.length} competitors: ${competitors.join(", ")}`);
      
      return c.json({ competitors });
    } catch (error: any) {
      console.error("[Discover Error]", error);
      return c.json({ error: error.message }, 500);
    }
  });

  // Email gate: register lead
  api.post("/lead", async (c) => {
    try {
      const { email } = await c.req.json();
      if (!email || typeof email !== "string" || !email.includes("@")) {
        return c.json({ error: "Valid email required" }, 400);
      }
      const lead = await storage.getOrCreateLead(email);
      return c.json({
        email: lead.email,
        auditCount: lead.auditCount,
        canAudit: lead.auditCount < MAX_SNAPSHOT_AUDITS_PER_EMAIL,
        remaining: Math.max(0, MAX_SNAPSHOT_AUDITS_PER_EMAIL - lead.auditCount),
      });
    } catch (error: any) {
      console.error("[Lead Error]", error);
      return c.json({ error: error.message }, 500);
    }
  });
  
  // Run a full audit
  api.post("/audit", async (c) => {
    try {
      const body = await c.req.json();
      const parsed = auditRequestSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: "Invalid request: " + parsed.error.issues.map(i => i.message).join(", ") }, 400);
      }
      
      const data = parsed.data;
      const ip = getIp(c);
      
      // Email gate for snapshot tier ONLY
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
      }
      
      // IP rate limiting (snapshot only)
      if (data.tier === "snapshot") {
        const ipCheck = await storage.checkIpLimit(ip, MAX_AUDITS_PER_IP_HOUR, 60);
        if (!ipCheck.allowed) {
          return c.json({ error: "rate_limited", message: "Too many audits from this location. Try again in an hour." }, 429);
        }
      }
      
      // Auto-detect category if missing
      if (!data.category || data.category === "general" || data.category.trim() === "") {
        const detected = detectBrandFromUrl(data.url);
        if (detected?.category) {
          data.category = detected.category;
        } else {
          const brandName = data.brandName || detected?.brand || "";
          console.log(`[Audit] No category provided, using AI to detect for ${brandName}`);
          const aiResult = await detectCategoryWithAI(data.url, brandName);
          data.category = aiResult.category;
          console.log(`[Audit] AI detected category: "${data.category}" (${aiResult.confidence})`);
        }
      }
      
      const result = await runAudit(data);
      
      // Save to database
      const saved = await storage.createAudit({
        brandName: result.brandName,
        brandUrl: result.brandUrl,
        category: result.category,
        tier: result.tier,
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
        createdAt: new Date(),
      });
      
      // Track lead usage + IP (snapshot only)
      if (data.tier === "snapshot" && data.email) {
        await storage.incrementLeadAuditCount(data.email);
        await storage.incrementIpCount(ip);
      }
      
      return c.json({ id: saved.id, ...result });
    } catch (error: any) {
      console.error("[Audit Error]", error);
      return c.json({ error: error.message }, 500);
    }
  });
  
  // Get a specific audit result
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
        language: audit.language,
        timestamp: audit.createdAt,
        scores,
        geoAudit,
        recommendations,
        customCompetitors,
      });
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });
  
  // Get audit history for a brand
  api.get("/history/:brandName", async (c) => {
    try {
      const history = await storage.getAuditsByBrand(c.req.param("brandName"));
      return c.json(history.map(a => ({
        id: a.id,
        brandName: a.brandName,
        overallScore: a.overallScore,
        overallGrade: a.overallGrade,
        tier: a.tier,
        createdAt: a.createdAt,
      })));
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });
  
  // Recent audits
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
        createdAt: a.createdAt,
      })));
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });

  return api;
}
