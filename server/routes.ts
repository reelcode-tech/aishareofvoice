import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { runAudit } from "./engine/audit-runner";
import { detectBrandFromUrl, detectCategoryWithAI } from "./engine/brand-detection";
import { discoverCompetitors } from "./engine/competitor-discovery";
import { auditRequestSchema } from "@shared/schema";

// Extract IP from request (handles proxies)
function getIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.ip || req.socket.remoteAddress || "unknown";
}

// Max free (snapshot) audits per email
const MAX_SNAPSHOT_AUDITS_PER_EMAIL = 3;
// Max audits per IP per hour (without email)
const MAX_AUDITS_PER_IP_HOUR = 5;

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Detect brand from URL (for the confirmation step)
  app.post("/api/detect", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: "URL required" });
      
      const detected = detectBrandFromUrl(url);
      if (!detected) {
        return res.json({ brand: "Unknown", category: "general", categoryConfidence: "low", categoryReason: "Could not identify brand from URL", categorySource: "ai_inferred" });
      }
      
      if (detected.category) {
        return res.json({ ...detected, categoryConfidence: "high", categoryReason: `${detected.brand} is a well-known brand in this space`, categorySource: "known_domain" });
      }
      
      console.log(`[Detect] Unknown domain, using AI to infer category for ${detected.brand}`);
      const aiResult = await detectCategoryWithAI(url, detected.brand);
      console.log(`[Detect] AI inferred category: "${aiResult.category}" (${aiResult.confidence})`);
      
      res.json({ brand: detected.brand, category: aiResult.category, categoryConfidence: aiResult.confidence, categoryReason: aiResult.reason, categorySource: aiResult.source });
    } catch (error: any) {
      console.error("[Detect Error]", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Combined detect + competitor discovery
  app.post("/api/detect-all", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: "URL required" });
      
      const detected = detectBrandFromUrl(url);
      const brand = detected?.brand || "Unknown";
      
      if (detected?.category) {
        console.log(`[DetectAll] Known domain ${brand} in ${detected.category}, fetching competitors...`);
        const competitors = await discoverCompetitors(brand, detected.category, url);
        return res.json({
          brand,
          category: detected.category,
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
      
      res.json({
        brand,
        category: aiResult.category,
        categoryConfidence: aiResult.confidence,
        categoryReason: aiResult.reason,
        categorySource: aiResult.source,
        competitors,
      });
    } catch (error: any) {
      console.error("[DetectAll Error]", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Discover competitors
  app.post("/api/discover-competitors", async (req, res) => {
    try {
      const { brandName, category, url } = req.body;
      if (!brandName) return res.status(400).json({ error: "Brand name required" });
      
      const cat = category || "general";
      console.log(`[Discover] Finding competitors for ${brandName} in ${cat}`);
      
      const competitors = await discoverCompetitors(brandName, cat, url);
      console.log(`[Discover] Found ${competitors.length} competitors: ${competitors.join(", ")}`);
      
      res.json({ competitors });
    } catch (error: any) {
      console.error("[Discover Error]", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ── Email gate: register lead ────────────────────────────
  app.post("/api/lead", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== "string" || !email.includes("@")) {
        return res.status(400).json({ error: "Valid email required" });
      }
      const lead = await storage.getOrCreateLead(email);
      res.json({
        email: lead.email,
        auditCount: lead.auditCount,
        canAudit: lead.auditCount < MAX_SNAPSHOT_AUDITS_PER_EMAIL,
        remaining: Math.max(0, MAX_SNAPSHOT_AUDITS_PER_EMAIL - lead.auditCount),
      });
    } catch (error: any) {
      console.error("[Lead Error]", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Run a full audit — email gate for snapshot only, paid tiers bypass
  app.post("/api/audit", async (req, res) => {
    try {
      const parsed = auditRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request: " + parsed.error.issues.map(i => i.message).join(", ") });
      }
      
      const data = parsed.data;
      const ip = getIp(req);
      
      // ── Email gate for snapshot tier ONLY ──
      if (data.tier === "snapshot") {
        if (!data.email) {
          return res.status(403).json({ error: "email_required", message: "Email is required to run a free audit." });
        }
        // Check per-email limit
        const lead = await storage.getOrCreateLead(data.email);
        if (lead.auditCount >= MAX_SNAPSHOT_AUDITS_PER_EMAIL) {
          return res.status(429).json({
            error: "email_limit_reached",
            message: `You've used all ${MAX_SNAPSHOT_AUDITS_PER_EMAIL} free audits. Upgrade to Monitor for unlimited audits.`,
            auditCount: lead.auditCount,
          });
        }
      }
      // Monitor and Agency tiers: no email gate, no audit limits
      
      // ── IP rate limiting (snapshot only) ──
      if (data.tier === "snapshot") {
        const ipCheck = await storage.checkIpLimit(ip, MAX_AUDITS_PER_IP_HOUR, 60);
        if (!ipCheck.allowed) {
          return res.status(429).json({
            error: "rate_limited",
            message: "Too many audits from this location. Try again in an hour.",
          });
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
        engineResults: JSON.stringify({
          perEngine: result.scores.perEngine,
          dimensions: result.scores.dimensions,
        }),
        competitors: JSON.stringify(result.scores.competitors),
        queryResults: JSON.stringify(result.scores.queryDetails),
        sentimentData: JSON.stringify(result.scores.sentimentBreakdown),
        citationData: JSON.stringify(result.engineResults.flatMap(r => r.citations)),
        geoAudit: JSON.stringify(result.geoAudit),
        recommendations: JSON.stringify(result.recommendations),
        customCompetitors: JSON.stringify(result.customCompetitors),
        createdAt: result.timestamp,
      });
      
      // Track lead usage + IP (snapshot only)
      if (data.tier === "snapshot" && data.email) {
        await storage.incrementLeadAuditCount(data.email);
        await storage.incrementIpCount(ip);
      }
      
      res.json({ id: saved.id, ...result });
    } catch (error: any) {
      console.error("[Audit Error]", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Get a specific audit result
  app.get("/api/audit/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const audit = await storage.getAudit(id);
      if (!audit) return res.status(404).json({ error: "Audit not found" });
      
      const engineResults = JSON.parse(audit.engineResults || "[]");
      const competitors = JSON.parse(audit.competitors || "[]");
      const queryResults = JSON.parse(audit.queryResults || "[]");
      const sentimentData = JSON.parse(audit.sentimentData || "{}");
      const citationData = JSON.parse(audit.citationData || "[]");
      const geoAudit = JSON.parse(audit.geoAudit || "{}");
      const recommendations = JSON.parse(audit.recommendations || "[]");
      const customCompetitors = JSON.parse(audit.customCompetitors || "[]");
      
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
      
      res.json({
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
      res.status(500).json({ error: error.message });
    }
  });
  
  // Get audit history for a brand
  app.get("/api/history/:brandName", async (req, res) => {
    try {
      const history = await storage.getAuditsByBrand(req.params.brandName);
      res.json(history.map(a => ({
        id: a.id,
        brandName: a.brandName,
        overallScore: a.overallScore,
        overallGrade: a.overallGrade,
        tier: a.tier,
        createdAt: a.createdAt,
      })));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Recent audits
  app.get("/api/recent", async (_req, res) => {
    try {
      const recent = await storage.getRecentAudits(10);
      res.json(recent.map(a => ({
        id: a.id,
        brandName: a.brandName,
        brandUrl: a.brandUrl,
        category: a.category,
        overallScore: a.overallScore,
        overallGrade: a.overallGrade,
        createdAt: a.createdAt,
      })));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}
