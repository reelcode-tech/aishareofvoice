import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Plus, X, Globe, AlertCircle, Sparkles, Users, ArrowRight, Check, Pencil, ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";

const LANGUAGES = [
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "pt", label: "Português", flag: "🇧🇷" },
  { code: "ja", label: "日本語", flag: "🇯🇵" },
  { code: "ko", label: "한국어", flag: "🇰🇷" },
  { code: "zh", label: "中文", flag: "🇨🇳" },
];

const SUGGESTED_CATEGORIES = [
  "skincare", "beauty", "mattresses", "fashion", "jewelry",
  "CRM software", "project management", "ecommerce", "electronics",
  "home appliances", "personal care", "consulting", "productivity",
];

type Step = "details" | "competitors";

export default function AuditForm() {
  const [, routeParams] = useRoute("/audit/:encodedUrl");
  const urlParam = routeParams?.encodedUrl ? decodeURIComponent(routeParams.encodedUrl) : "";
  
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>("details");
  const [url, setUrl] = useState(urlParam);
  const [brandName, setBrandName] = useState("");
  const [category, setCategory] = useState("");
  const [tier, setTier] = useState("free");
  const [language, setLanguage] = useState("en");
  const [detected, setDetected] = useState(false);
  const [categoryAutoDetected, setCategoryAutoDetected] = useState(false);
  const [categoryConfidence, setCategoryConfidence] = useState<"high" | "medium" | "low" | null>(null);
  const [categoryReason, setCategoryReason] = useState("");
  const [categorySource, setCategorySource] = useState<"known_domain" | "ai_inferred" | null>(null);
  
  // Competitor state
  const [competitors, setCompetitors] = useState<string[]>([]);
  const [newCompetitor, setNewCompetitor] = useState("");
  const [competitorsConfirmed, setCompetitorsConfirmed] = useState(false);
  
  // Auto-detect brand AND category from URL
  const detectMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await apiRequest("POST", "/api/detect", { url });
      return res.json();
    },
    onSuccess: (data) => {
      setBrandName(data.brand || "");
      if (data.category && data.category !== "general") {
        setCategory(data.category);
        setCategoryAutoDetected(true);
      }
      if (data.categoryConfidence) setCategoryConfidence(data.categoryConfidence);
      if (data.categoryReason) setCategoryReason(data.categoryReason);
      if (data.categorySource) setCategorySource(data.categorySource);
      setDetected(true);
    },
  });
  
  // Discover competitors
  const discoverMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/discover-competitors", {
        brandName,
        category: category || "general",
        url,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setCompetitors(data.competitors || []);
    },
  });
  
  // Run audit
  const auditMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/audit", {
        url,
        brandName,
        category,
        tier,
        language,
        customCompetitors: competitors.length > 0 ? competitors : undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      navigate(`/results/${data.id}`);
    },
  });
  
  useEffect(() => {
    if (urlParam) {
      detectMutation.mutate(urlParam);
    }
  }, [urlParam]);
  
  // When moving to step 2, auto-discover competitors
  const goToCompetitorStep = () => {
    setStep("competitors");
    setCompetitorsConfirmed(false);
    discoverMutation.mutate();
  };
  
  const goBackToDetails = () => {
    setStep("details");
  };
  
  const addCompetitor = () => {
    const name = newCompetitor.trim();
    if (name && !competitors.includes(name)) {
      setCompetitors([...competitors, name]);
      setNewCompetitor("");
    }
  };
  
  const removeCompetitor = (comp: string) => {
    setCompetitors(competitors.filter(c => c !== comp));
  };
  
  const runAudit = () => {
    setCompetitorsConfirmed(true);
    auditMutation.mutate();
  };
  
  const selectedLang = LANGUAGES.find(l => l.code === language);
  const canProceedToStep2 = url && brandName;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 backdrop-blur-sm sticky top-0 z-50 bg-background/80">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => step === "competitors" ? goBackToDetails() : navigate("/")}
            className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 text-sm"
            data-testid="back-button"
          >
            <ArrowLeft className="w-4 h-4" />
            {step === "competitors" ? "Back to Details" : "Change URL"}
          </button>
          
          {/* Step indicator */}
          <div className="flex items-center gap-2 ml-auto text-xs text-muted-foreground">
            <span className={`flex items-center gap-1 ${step === "details" ? "text-primary font-medium" : "text-muted-foreground"}`}>
              {step === "competitors" ? <Check className="w-3 h-3" /> : <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-[10px]">1</span>}
              Details
            </span>
            <span className="text-border">—</span>
            <span className={`flex items-center gap-1 ${step === "competitors" ? "text-primary font-medium" : "text-muted-foreground"}`}>
              <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-[10px]">2</span>
              Competitors
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* ====================== STEP 1: Details ====================== */}
        {step === "details" && (
          <>
            <h1 className="text-xl font-bold mb-2" data-testid="form-heading">Confirm Audit Details</h1>
            <p className="text-sm text-muted-foreground mb-8">
              We auto-detected your brand and category. Review the details below, then we'll identify your competitors.
            </p>

            <div className="space-y-6">
              {/* URL */}
              <div>
                <Label htmlFor="url" className="text-sm font-medium mb-1.5 block">Website URL</Label>
                <Input
                  id="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="bg-card"
                  data-testid="input-url"
                />
              </div>

              {/* Brand Name */}
              <div>
                <Label htmlFor="brand" className="text-sm font-medium mb-1.5 block">Brand Name</Label>
                <Input
                  id="brand"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder={detectMutation.isPending ? "Detecting..." : "Enter brand name"}
                  className="bg-card"
                  data-testid="input-brand"
                />
              </div>

              {/* Category — intelligent detection */}
              <div>
                <Label htmlFor="category" className="text-sm font-medium mb-1.5 block">
                  Category
                  {detectMutation.isPending && (
                    <span className="text-xs text-muted-foreground ml-2 font-normal">
                      <Loader2 className="w-3 h-3 inline animate-spin mr-1" />
                      analyzing site...
                    </span>
                  )}
                </Label>

                {/* Confidence card — shown when auto-detected */}
                {categoryAutoDetected && category && categoryConfidence && !detectMutation.isPending && (
                  <div className={`rounded-lg border p-3 mb-2.5 ${
                    categoryConfidence === "high" 
                      ? "bg-primary/5 border-primary/20" 
                      : categoryConfidence === "medium"
                      ? "bg-yellow-500/5 border-yellow-500/20"
                      : "bg-orange-500/5 border-orange-500/20"
                  }`} data-testid="category-confidence-card">
                    <div className="flex items-start gap-2.5">
                      {categoryConfidence === "high" ? (
                        <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                      ) : categoryConfidence === "medium" ? (
                        <ShieldAlert className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                      ) : (
                        <ShieldQuestion className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground capitalize">{category}</span>
                          <Badge 
                            variant="outline" 
                            className={`text-[10px] ${
                              categoryConfidence === "high" 
                                ? "text-primary border-primary/30" 
                                : categoryConfidence === "medium"
                                ? "text-yellow-500 border-yellow-500/30"
                                : "text-orange-400 border-orange-400/30"
                            }`}
                          >
                            {categoryConfidence} confidence
                          </Badge>
                          {categorySource === "known_domain" && (
                            <Badge variant="outline" className="text-[10px] text-foreground/40 border-border/40">
                              known brand
                            </Badge>
                          )}
                        </div>
                        {categoryReason && (
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{categoryReason}</p>
                        )}
                        {categoryConfidence !== "high" && (
                          <p className="text-xs text-muted-foreground/70 mt-1">
                            Getting the category right matters — it controls which queries we test and which competitors we compare you against.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <Input
                  id="category"
                  value={category}
                  onChange={(e) => { setCategory(e.target.value); setCategoryAutoDetected(false); setCategoryConfidence(null); }}
                  placeholder={detectMutation.isPending ? "AI is analyzing your site..." : "e.g. skincare, mattresses, CRM software"}
                  className="bg-card"
                  data-testid="input-category"
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  {category && categoryAutoDetected 
                    ? "Edit if this doesn’t look right — this determines every query we test." 
                    : category 
                    ? "This determines which queries we test and who we compare you against."
                    : "We’ll infer this from your site. Getting it right matters for accurate results."
                  }
                </p>
                {!category && detected && !detectMutation.isPending && (
                  <div className="mt-2.5">
                    <p className="text-xs text-muted-foreground mb-1.5">Or pick one:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {SUGGESTED_CATEGORIES.map(cat => (
                        <button
                          key={cat}
                          onClick={() => { setCategory(cat); setCategoryAutoDetected(false); setCategoryConfidence(null); }}
                          className="px-2.5 py-1 rounded-md text-xs border border-border/50 bg-card hover:border-primary/50 hover:text-primary transition-colors"
                          data-testid={`category-quick-${cat.replace(/\s+/g, '-').toLowerCase()}`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Language */}
              <div>
                <Label className="text-sm font-medium mb-1.5 block">
                  <Globe className="w-4 h-4 inline mr-1.5" />
                  Query Language
                </Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="bg-card" data-testid="select-language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map(lang => (
                      <SelectItem key={lang.code} value={lang.code}>
                        {lang.flag} {lang.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {language !== "en" && (
                  <p className="text-xs text-primary mt-1.5">
                    Queries will run in {selectedLang?.label} to match how your market searches.
                  </p>
                )}
              </div>

              {/* Tier Selection */}
              <div>
                <Label className="text-sm font-medium mb-1.5 block">Audit Depth</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { id: "free", label: "Starter", line1: "Quick snapshot", line2: "12 AI queries", price: "Free" },
                    { id: "pro", label: "Growth", line1: "Full visibility scan", line2: "20 queries, 3 AI engines", price: "$29" },
                    { id: "business", label: "Pro", line1: "Deep competitive intel", line2: "25 queries, weekly tracking", price: "$99" },
                    { id: "enterprise", label: "Enterprise", line1: "Ongoing optimization", line2: "30 queries, daily alerts", price: "$299" },
                  ].map(t => (
                    <button
                      key={t.id}
                      onClick={() => setTier(t.id)}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        tier === t.id
                          ? "border-primary bg-primary/5"
                          : "border-border/50 bg-card hover:border-border"
                      }`}
                      data-testid={`tier-${t.id}`}
                    >
                      <div className="text-sm font-semibold">{t.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{t.line1}</div>
                      <div className="text-xs text-muted-foreground">{t.line2}</div>
                      <div className="text-xs font-semibold text-primary mt-1">{t.price}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Next: Discover Competitors */}
              <Button
                onClick={goToCompetitorStep}
                disabled={!canProceedToStep2 || detectMutation.isPending}
                className="w-full h-12 text-base"
                data-testid="button-next-competitors"
              >
                Identify Competitors
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </>
        )}

        {/* ====================== STEP 2: Competitor Preview ====================== */}
        {step === "competitors" && (
          <>
            <div className="flex items-center gap-3 mb-2">
              <Users className="w-5 h-5 text-primary" />
              <h1 className="text-xl font-bold" data-testid="competitors-heading">Review Competitors</h1>
            </div>
            <p className="text-sm text-muted-foreground mb-8">
              We identified these competitors for <span className="text-foreground font-medium">{brandName}</span> in <span className="text-foreground font-medium">{category || "general"}</span>. Add, remove, or edit before running the audit.
            </p>

            <div className="space-y-6">
              {/* Loading state */}
              {discoverMutation.isPending && (
                <div className="flex items-center justify-center py-12" data-testid="competitors-loading">
                  <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">Identifying competitors for {brandName}...</p>
                    <p className="text-xs text-muted-foreground mt-1">This takes a few seconds</p>
                  </div>
                </div>
              )}

              {/* Error state */}
              {discoverMutation.isError && (
                <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-4" data-testid="competitors-error">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium">Couldn't auto-detect competitors</p>
                      <p className="text-xs mt-1 opacity-80">
                        You can still add competitors manually below.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Competitor list */}
              {!discoverMutation.isPending && (
                <div>
                  <Label className="text-sm font-medium mb-3 block">
                    Detected Competitors ({competitors.length})
                    {competitors.length > 0 && (
                      <span className="text-xs text-primary ml-2 font-normal">
                        <Sparkles className="w-3 h-3 inline mr-1" />
                        AI-identified
                      </span>
                    )}
                  </Label>
                  
                  {competitors.length > 0 ? (
                    <div className="space-y-2" data-testid="competitor-list">
                      {competitors.map((comp, i) => (
                        <div
                          key={comp}
                          className="flex items-center gap-3 bg-card border border-border/50 rounded-lg px-4 py-3 group"
                          data-testid={`competitor-item-${i}`}
                        >
                          <span className="text-xs text-muted-foreground w-5 text-right">{i + 1}.</span>
                          <span className="text-sm font-medium flex-1">{comp}</span>
                          <button
                            onClick={() => removeCompetitor(comp)}
                            className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                            data-testid={`remove-competitor-${i}`}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : !discoverMutation.isPending && (
                    <div className="text-sm text-muted-foreground bg-card border border-border/30 rounded-lg p-6 text-center">
                      No competitors detected. Add some manually below.
                    </div>
                  )}

                  {/* Add competitor input */}
                  <div className="mt-4">
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Add a competitor</Label>
                    <div className="flex gap-2">
                      <Input
                        value={newCompetitor}
                        onChange={(e) => setNewCompetitor(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCompetitor())}
                        placeholder="Type a competitor brand name"
                        className="bg-card flex-1"
                        data-testid="input-add-competitor"
                      />
                      <Button variant="secondary" size="sm" onClick={addCompetitor} className="px-3" data-testid="button-add-competitor">
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Summary bar */}
              {!discoverMutation.isPending && (
                <div className="bg-card/50 border border-border/30 rounded-lg p-4 text-xs text-muted-foreground">
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <span>Brand: <span className="text-foreground font-medium">{brandName}</span></span>
                    <span>Category: <span className="text-foreground font-medium">{category || "general"}</span></span>
                    <span>Language: <span className="text-foreground font-medium">{selectedLang?.flag} {selectedLang?.label}</span></span>
                    <span>Tier: <span className="text-foreground font-medium capitalize">{tier}</span></span>
                  </div>
                </div>
              )}

              {/* Run Audit button */}
              {!discoverMutation.isPending && (
                <Button
                  onClick={runAudit}
                  disabled={auditMutation.isPending || !url || !brandName}
                  className="w-full h-12 text-base"
                  data-testid="button-run-audit"
                >
                  {auditMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analyzing AI visibility...
                    </>
                  ) : (
                    <>
                      Run AI Visibility Audit
                      {competitors.length > 0 && (
                        <span className="text-xs opacity-70 ml-2">
                          vs {competitors.length} competitor{competitors.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </>
                  )}
                </Button>
              )}
              
              {auditMutation.isError && (
                <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-4" data-testid="error-message">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium">Audit failed</p>
                      <p className="text-xs mt-1 opacity-80">
                        {(() => {
                          const msg = auditMutation.error.message || "";
                          if (msg.includes("<html") || msg.includes("<style") || msg.includes("<!DOCTYPE")) {
                            return "The server encountered an error. Please try again in a moment.";
                          }
                          const cleaned = msg.replace(/^\d{3}:\s*/, "");
                          return cleaned.length > 200 ? cleaned.slice(0, 200) + "..." : cleaned;
                        })()}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
