import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { runAudit } from "./engine/audit-runner";
import { detectBrandFromUrl } from "./engine/brand-detection";
import { auditRequestSchema } from "@shared/schema";

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
      res.json(detected || { brand: "Unknown", category: "general" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Run a full audit
  app.post("/api/audit", async (req, res) => {
    try {
      const parsed = auditRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues });
      }
      
      const result = await runAudit(parsed.data);
      
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
