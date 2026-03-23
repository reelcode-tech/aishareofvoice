import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { runAudit } from "./engine/audit-runner";
import { detectBrandFromUrl, detectCategoryWithAI } from "./engine/brand-detection";
import { discoverCompetitors } from "./engine/competitor-discovery";
import { auditRequestSchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Detect brand from URL (for the confirmation step)
  // Also uses AI to infer the category if not in the known-domains list
  app.post("/api/detect", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: "URL required" });
      
      const detected = detectBrandFromUrl(url);
      if (!detected) {
        return res.json({ brand: "Unknown", category: "general", categoryConfidence: "low", categoryReason: "Could not identify brand from URL", categorySource: "ai_inferred" });
      }
      
      // If we know the domain, return immediately with high confidence
      if (detected.category) {
        return res.json({ ...detected, categoryConfidence: "high", categoryReason: `${detected.brand} is a well-known brand in this space`, categorySource: "known_domain" });
      }
      
      // For unknown domains, use AI to infer the category
      console.log(`[Detect] Unknown domain, using AI to infer category for ${detected.brand}`);
      const aiResult = await detectCategoryWithAI(url, detected.brand);
      console.log(`[Detect] AI inferred category: "${aiResult.category}" (${aiResult.confidence})`);
      
      res.json({ brand: detected.brand, category: aiResult.category, categoryConfidence: aiResult.confidence, categoryReason: aiResult.reason, categorySource: aiResult.source });
    } catch (error: any) {
      console.error("[Detect Error]", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Combined detect + competitor discovery — single call, parallel execution
  // Returns brand, category (with confidence), AND competitors in one shot
  app.post("/api/detect-all", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: "URL required" });
      
      const detected = detectBrandFromUrl(url);
      const brand = detected?.brand || "Unknown";
      
      // For known domains: we already have brand + category, just need competitors
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
      
      // For unknown domains: run category detection first, then competitors with the correct category
      // This avoids the wasteful pattern of running broad competitors and then re-running
      console.log(`[DetectAll] Unknown domain — detecting category for ${brand}...`);
      const aiResult = await detectCategoryWithAI(url, brand);
      console.log(`[DetectAll] Category detected: "${aiResult.category}" (${aiResult.confidence}). Now discovering competitors...`);
      
      // Now discover competitors with the correct category
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

  // Discover competitors for a brand+category (lightweight AI call)
  // This runs BEFORE the full audit so the user can review/edit the competitor set
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
  
  // Run a full audit
  app.post("/api/audit", async (req, res) => {
    try {
      const parsed = auditRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request: " + parsed.error.issues.map(i => i.message).join(", ") });
      }
      
      const data = parsed.data;
      
      // If category is missing or generic, auto-detect it with AI
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
      
      // Save to database for historical tracking
      // engineResults stores { perEngine, dimensions } so the GET endpoint can reconstruct the full scores object
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
      
      res.json({ id: saved.id, ...result });
    } catch (error: any) {
      console.error("[Audit Error]", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Get a specific audit result
  // Reconstructs the nested `scores` object that the Results page expects
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
      
      // Reconstruct the scores object that the Results page expects
      // The POST /api/audit returns { scores: { overall, dimensions, ... } }
      // but the DB stores flat fields. We rebuild that structure here.
      const scores = {
        overall: {
          score: audit.overallScore ?? 0,
          grade: audit.overallGrade ?? "Unknown",
          confidenceLow: audit.confidenceLow ?? 0,
          confidenceHigh: audit.confidenceHigh ?? 0,
          marginOfError: parseFloat(audit.marginOfError ?? "0"),
          observations: audit.observations ?? 0,
        },
        // Dimensions and per-engine are stored inside engineResults JSON
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
  
  // Get audit history for a brand (for historical tracking)
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
