import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Plus, X, Globe, AlertCircle, Sparkles, Users, Check, Pencil, ShieldCheck, ShieldAlert, ShieldQuestion, Zap, Crown, Rocket } from "lucide-react";

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

const TIERS = [
  {
    id: "free",
    label: "Free",
    description: "Quick snapshot",
    detail: "12 queries, 2 AI engines",
    price: "Free",
    icon: Zap,
  },
  {
    id: "pro",
    label: "Pro",
    description: "Full competitive scan",
    detail: "25 queries, 3 AI engines",
    price: "$99",
    icon: Rocket,
    popular: true,
  },
  {
    id: "enterprise",
    label: "Enterprise",
    description: "Deep strategic intel",
    detail: "30 queries, 3 AI engines, priority",
    price: "$299",
    icon: Crown,
  },
];

export default function AuditForm() {
  const [, routeParams] = useRoute("/audit/:encodedUrl");
  const urlParam = routeParams?.encodedUrl ? decodeURIComponent(routeParams.encodedUrl) : "";
  
  const [, navigate] = useLocation();
  const [url, setUrl] = useState(urlParam);
  const [brandName, setBrandName] = useState("");
  const [category, setCategory] = useState("");
  const [tier, setTier] = useState("free");
  const [language, setLanguage] = useState("en");
  const [categoryAutoDetected, setCategoryAutoDetected] = useState(false);
  const [categoryConfidence, setCategoryConfidence] = useState<"high" | "medium" | "low" | null>(null);
  const [categoryReason, setCategoryReason] = useState("");
  const [categorySource, setCategorySource] = useState<"known_domain" | "ai_inferred" | null>(null);
  
  // Competitor state
  const [competitors, setCompetitors] = useState<string[]>([]);
  const [newCompetitor, setNewCompetitor] = useState("");
  const [detectionComplete, setDetectionComplete] = useState(false);
  
  // Single combined detect call — brand + category + competitors in one shot
  const detectAllMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await apiRequest("POST", "/api/detect-all", { url });
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
      if (data.competitors?.length > 0) {
        setCompetitors(data.competitors);
      }
      setDetectionComplete(true);
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
      detectAllMutation.mutate(urlParam);
    }
  }, [urlParam]);
  
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
    auditMutation.mutate();
  };
  
  const selectedLang = LANGUAGES.find(l => l.code === language);
  const isDetecting = detectAllMutation.isPending;
  const canRunAudit = url && brandName && !isDetecting;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 backdrop-blur-sm sticky top-0 z-50 bg-background/80">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 text-sm"
            data-testid="back-button"
          >
            <ArrowLeft className="w-4 h-4" />
            Change URL
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-xl font-bold mb-1.5" data-testid="form-heading">Configure your audit</h1>
        <p className="text-sm text-muted-foreground mb-8">
          {isDetecting 
            ? "Analyzing your site, detecting category, and identifying competitors..."
            : detectionComplete
            ? "Review your details, competitors, and choose your audit depth."
            : "We'll auto-detect your brand, category, and competitors."
          }
        </p>

        <div className="space-y-7">
          {/* ── Brand & URL Section ─────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <Label htmlFor="brand" className="text-sm font-medium mb-1.5 block">Brand name</Label>
              <Input
                id="brand"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder={isDetecting ? "Detecting..." : "Enter brand name"}
                className="bg-card"
                data-testid="input-brand"
              />
            </div>
          </div>

          {/* ── Category Section ──────────────────────────────────── */}
          <div>
            <Label htmlFor="category" className="text-sm font-medium mb-1.5 block">
              Category
              {isDetecting && (
                <span className="text-xs text-muted-foreground ml-2 font-normal">
                  <Loader2 className="w-3 h-3 inline animate-spin mr-1" />
                  analyzing site...
                </span>
              )}
            </Label>

            {/* Confidence card — shown when auto-detected */}
            {categoryAutoDetected && category && categoryConfidence && !isDetecting && (
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
              placeholder={isDetecting ? "AI is analyzing your site..." : "e.g. skincare, mattresses, CRM software"}
              className="bg-card"
              data-testid="input-category"
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              {category && categoryAutoDetected 
                ? "Edit if this doesn't look right — this determines every query we test." 
                : category 
                ? "This determines which queries we test and who we compare you against."
                : "We'll infer this from your site. Getting it right matters for accurate results."
              }
            </p>
            {!category && detectionComplete && !isDetecting && (
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

          {/* ── Competitors Section ───────────────────────────────── */}
          <div>
            <Label className="text-sm font-medium mb-2 block">
              <Users className="w-4 h-4 inline mr-1.5 -mt-0.5" />
              Competitors
              {isDetecting && (
                <span className="text-xs text-muted-foreground ml-2 font-normal">
                  <Loader2 className="w-3 h-3 inline animate-spin mr-1" />
                  identifying...
                </span>
              )}
              {!isDetecting && competitors.length > 0 && (
                <span className="text-xs text-primary ml-2 font-normal">
                  <Sparkles className="w-3 h-3 inline mr-0.5" />
                  {competitors.length} detected
                </span>
              )}
            </Label>

            {/* Loading skeleton for competitors */}
            {isDetecting && (
              <div className="space-y-2" data-testid="competitors-loading">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-10 bg-card border border-border/30 rounded-lg animate-pulse" />
                ))}
              </div>
            )}

            {/* Competitor chips */}
            {!isDetecting && competitors.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3" data-testid="competitor-list">
                {competitors.map((comp, i) => (
                  <div
                    key={comp}
                    className="flex items-center gap-1.5 bg-card border border-border/50 rounded-lg px-3 py-1.5 group"
                    data-testid={`competitor-item-${i}`}
                  >
                    <span className="text-sm">{comp}</span>
                    <button
                      onClick={() => removeCompetitor(comp)}
                      className="text-muted-foreground hover:text-destructive transition-colors ml-0.5"
                      data-testid={`remove-competitor-${i}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* No competitors found */}
            {!isDetecting && competitors.length === 0 && detectionComplete && (
              <p className="text-xs text-muted-foreground mb-2">
                No competitors auto-detected. Add some manually below.
              </p>
            )}

            {/* Add competitor input */}
            {!isDetecting && (
              <div className="flex gap-2">
                <Input
                  value={newCompetitor}
                  onChange={(e) => setNewCompetitor(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCompetitor())}
                  placeholder="Add a competitor"
                  className="bg-card flex-1 h-9 text-sm"
                  data-testid="input-add-competitor"
                />
                <Button variant="secondary" size="sm" onClick={addCompetitor} className="px-3 h-9" data-testid="button-add-competitor">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          {/* ── Language ──────────────────────────────────────────── */}
          <div>
            <Label className="text-sm font-medium mb-1.5 block">
              <Globe className="w-4 h-4 inline mr-1.5 -mt-0.5" />
              Query language
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

          {/* ── Tier Selection ────────────────────────────────────── */}
          <div>
            <Label className="text-sm font-medium mb-3 block">Audit depth</Label>
            <div className="grid grid-cols-3 gap-3">
              {TIERS.map(t => {
                const Icon = t.icon;
                const isSelected = tier === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTier(t.id)}
                    className={`relative p-4 rounded-xl border text-left transition-all ${
                      isSelected
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "border-border/50 bg-card hover:border-border"
                    }`}
                    data-testid={`tier-${t.id}`}
                  >
                    {t.popular && (
                      <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                        <Badge className="text-[10px] bg-primary/90 text-primary-foreground px-2 py-0">
                          Most popular
                        </Badge>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-1.5">
                      <Icon className={`w-4 h-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="text-sm font-semibold">{t.label}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{t.description}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{t.detail}</div>
                    <div className={`text-sm font-bold mt-2 ${isSelected ? "text-primary" : "text-foreground"}`}>{t.price}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Run Audit Button ──────────────────────────────────── */}
          <Button
            onClick={runAudit}
            disabled={!canRunAudit || auditMutation.isPending}
            className="w-full h-12 text-base"
            data-testid="button-run-audit"
          >
            {auditMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing AI visibility...
              </>
            ) : isDetecting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Still detecting...
              </>
            ) : (
              <>
                Run AI visibility audit
                {competitors.length > 0 && (
                  <span className="text-xs opacity-70 ml-2">
                    vs {competitors.length} competitor{competitors.length !== 1 ? "s" : ""}
                  </span>
                )}
              </>
            )}
          </Button>

          {/* Audit error */}
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

          {/* Detection error */}
          {detectAllMutation.isError && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-4" data-testid="detect-error">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Auto-detection failed</p>
                  <p className="text-xs mt-1 opacity-80">
                    Fill in the fields manually and add competitors below.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
