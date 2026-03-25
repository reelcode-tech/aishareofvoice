import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Plus, X, Globe, AlertCircle, Sparkles, Users, Check, Pencil, ShieldCheck, ShieldAlert, ShieldQuestion, Zap, Crown, Rocket, Mail, Lock } from "lucide-react";

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
    id: "snapshot",
    label: "Snapshot",
    description: "Free one-time audit",
    features: ["2 AI engines (ChatGPT + Gemini)", "12 queries", "Top 3 competitors", "1 playbook (llms.txt)"],
    lockedFeatures: ["Trend tracking", "All playbooks", "Weekly re-runs"],
    price: "Free",
    priceDetail: "Email required",
    icon: Zap,
  },
  {
    id: "monitor",
    label: "Monitor",
    description: "Track your brand continuously",
    features: ["3 AI engines (+Claude)", "25 queries per run", "All competitors visible", "All playbooks unlocked", "Full query-level responses", "Loss attribution"],
    lockedFeatures: [],
    price: "$79",
    priceDetail: "/month \u00b7 1 brand",
    icon: Rocket,
    popular: true,
  },
  {
    id: "agency",
    label: "Agency",
    description: "Multi-brand monitoring",
    features: ["5 AI engines (+Grok +Perplexity)", "30 queries per brand", "All competitors + deep analysis", "All playbooks unlocked", "Full query-level responses", "Multi-brand support (up to 10)"],
    lockedFeatures: [],
    price: "$349",
    priceDetail: "/month \u00b7 up to 10 brands",
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
  const [tier, setTier] = useState("snapshot");
  const [language, setLanguage] = useState("en");
  const [categoryAutoDetected, setCategoryAutoDetected] = useState(false);
  const [categoryConfidence, setCategoryConfidence] = useState<"high" | "medium" | "low" | null>(null);
  const [categoryReason, setCategoryReason] = useState("");
  const [categorySource, setCategorySource] = useState<"known_domain" | "ai_inferred" | null>(null);
  
  // Email gate state
  const [email, setEmail] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [remainingAudits, setRemainingAudits] = useState<number | null>(null);
  
  // Competitor state
  const [competitors, setCompetitors] = useState<string[]>([]);
  const [newCompetitor, setNewCompetitor] = useState("");
  const [detectionComplete, setDetectionComplete] = useState(false);
  
  // Single combined detect call
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

  // Email validation
  const emailMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequest("POST", "/api/lead", { email });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.canAudit) {
        setEmailSubmitted(true);
        setRemainingAudits(data.remaining);
        setEmailError("");
      } else {
        setEmailError(`You've used all ${data.auditCount} free audits. Upgrade to Monitor for unlimited audits.`);
      }
    },
    onError: () => {
      setEmailError("Please enter a valid email address.");
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
        email: tier === "snapshot" ? email : undefined,
        customCompetitors: competitors.length > 0 ? competitors : undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      navigate(`/results/${data.id}`);
    },
    onError: (error: any) => {
      // Handle specific error types
      const msg = error.message || "";
      if (msg.includes("email_required")) {
        setEmailError("Email is required to run a free audit.");
      } else if (msg.includes("email_limit_reached")) {
        setEmailError("You've used all your free audits. Upgrade to Monitor for unlimited access.");
      }
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
  
  const handleEmailSubmit = () => {
    if (!email.includes("@")) {
      setEmailError("Please enter a valid email address.");
      return;
    }
    emailMutation.mutate(email);
  };
  
  const runAudit = () => {
    auditMutation.mutate();
  };
  
  const selectedLang = LANGUAGES.find(l => l.code === language);
  const isDetecting = detectAllMutation.isPending;
  const needsEmail = tier === "snapshot" && !emailSubmitted;
  const canRunAudit = url && brandName && !isDetecting && !needsEmail;

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
            <div>
              <Label htmlFor="url" className="text-sm font-medium mb-1.5 block">Website URL</Label>
              <Input id="url" value={url} onChange={(e) => setUrl(e.target.value)} className="bg-card" data-testid="input-url" />
            </div>
            <div>
              <Label htmlFor="brand" className="text-sm font-medium mb-1.5 block">Brand name</Label>
              <Input id="brand" value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder={isDetecting ? "Detecting..." : "Enter brand name"} className="bg-card" data-testid="input-brand" />
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
                      <Badge variant="outline" className={`text-[10px] ${
                        categoryConfidence === "high" ? "text-primary border-primary/30" 
                        : categoryConfidence === "medium" ? "text-yellow-500 border-yellow-500/30"
                        : "text-orange-400 border-orange-400/30"
                      }`}>
                        {categoryConfidence} confidence
                      </Badge>
                      {categorySource === "known_domain" && (
                        <Badge variant="outline" className="text-[10px] text-foreground/40 border-border/40">known brand</Badge>
                      )}
                    </div>
                    {categoryReason && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{categoryReason}</p>}
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
              id="category" value={category}
              onChange={(e) => { setCategory(e.target.value); setCategoryAutoDetected(false); setCategoryConfidence(null); }}
              placeholder={isDetecting ? "AI is analyzing your site..." : "e.g. skincare, mattresses, CRM software"}
              className="bg-card" data-testid="input-category"
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
                    <button key={cat} onClick={() => { setCategory(cat); setCategoryAutoDetected(false); setCategoryConfidence(null); }}
                      className="px-2.5 py-1 rounded-md text-xs border border-border/50 bg-card hover:border-primary/50 hover:text-primary transition-colors">
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
                  <Loader2 className="w-3 h-3 inline animate-spin mr-1" />identifying...
                </span>
              )}
              {!isDetecting && competitors.length > 0 && (
                <span className="text-xs text-primary ml-2 font-normal">
                  <Sparkles className="w-3 h-3 inline mr-0.5" />{competitors.length} detected
                </span>
              )}
            </Label>

            {isDetecting && (
              <div className="space-y-2" data-testid="competitors-loading">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-10 bg-card border border-border/30 rounded-lg animate-pulse" />
                ))}
              </div>
            )}

            {!isDetecting && competitors.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3" data-testid="competitor-list">
                {competitors.map((comp, i) => (
                  <div key={comp} className="flex items-center gap-1.5 bg-card border border-border/50 rounded-lg px-3 py-1.5 group">
                    <span className="text-sm">{comp}</span>
                    <button onClick={() => removeCompetitor(comp)} className="text-muted-foreground hover:text-destructive transition-colors ml-0.5">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {!isDetecting && competitors.length === 0 && detectionComplete && (
              <p className="text-xs text-muted-foreground mb-2">No competitors auto-detected. Add some manually below.</p>
            )}

            {!isDetecting && (
              <div className="flex gap-2">
                <Input value={newCompetitor} onChange={(e) => setNewCompetitor(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCompetitor())}
                  placeholder="Add a competitor" className="bg-card flex-1 h-9 text-sm" />
                <Button variant="secondary" size="sm" onClick={addCompetitor} className="px-3 h-9"><Plus className="w-4 h-4" /></Button>
              </div>
            )}
          </div>

          {/* ── Language ──────────────────────────────────────────── */}
          <div>
            <Label className="text-sm font-medium mb-1.5 block">
              <Globe className="w-4 h-4 inline mr-1.5 -mt-0.5" />Query language
            </Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LANGUAGES.map(lang => (
                  <SelectItem key={lang.code} value={lang.code}>{lang.flag} {lang.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {language !== "en" && (
              <p className="text-xs text-primary mt-1.5">Queries will run in {selectedLang?.label} to match how your market searches.</p>
            )}
          </div>

          {/* ── Tier Selection ────────────────────────────────────── */}
          <div>
            <Label className="text-sm font-medium mb-3 block">Choose your plan</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                        <Badge className="text-[10px] bg-primary/90 text-primary-foreground px-2 py-0">Most popular</Badge>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-1.5">
                      <Icon className={`w-4 h-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="text-sm font-semibold">{t.label}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mb-2">{t.description}</div>
                    
                    {/* Feature list */}
                    <div className="space-y-1 mb-3">
                      {t.features.slice(0, 4).map(f => (
                        <div key={f} className="flex items-center gap-1.5 text-xs text-foreground/70">
                          <Check className="w-3 h-3 text-primary flex-shrink-0" />
                          <span>{f}</span>
                        </div>
                      ))}
                      {t.lockedFeatures.slice(0, 2).map(f => (
                        <div key={f} className="flex items-center gap-1.5 text-xs text-foreground/30">
                          <Lock className="w-3 h-3 flex-shrink-0" />
                          <span>{f}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-baseline gap-1">
                      <span className={`text-lg font-bold ${isSelected ? "text-primary" : "text-foreground"}`}>{t.price}</span>
                      {t.priceDetail && <span className="text-xs text-muted-foreground">{t.priceDetail}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Email Gate (Snapshot tier only) ───────────────────── */}
          {tier === "snapshot" && (
            <div className={`rounded-xl border p-5 transition-all ${
              emailSubmitted 
                ? "bg-primary/5 border-primary/20" 
                : "bg-card border-border/50"
            }`}>
              <div className="flex items-start gap-3">
                <Mail className={`w-5 h-5 mt-0.5 flex-shrink-0 ${emailSubmitted ? "text-primary" : "text-muted-foreground"}`} />
                <div className="flex-1">
                  {emailSubmitted ? (
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{email}</span>
                        <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                          <Check className="w-2.5 h-2.5 mr-0.5" />verified
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {remainingAudits !== null 
                          ? `${remainingAudits} free audit${remainingAudits !== 1 ? "s" : ""} remaining. We'll send your results summary to this email.`
                          : "We'll send your results summary to this email."
                        }
                      </p>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-foreground mb-1">Enter your email to get your free audit</p>
                      <p className="text-xs text-muted-foreground mb-3">
                        We'll send you your results and alert you if your AI visibility changes.
                      </p>
                      <div className="flex gap-2">
                        <Input
                          type="email"
                          value={email}
                          onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
                          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleEmailSubmit())}
                          placeholder="you@company.com"
                          className="bg-background flex-1 h-9 text-sm"
                          data-testid="input-email"
                        />
                        <Button
                          size="sm"
                          onClick={handleEmailSubmit}
                          disabled={emailMutation.isPending || !email.includes("@")}
                          className="h-9 px-4"
                          data-testid="button-verify-email"
                        >
                          {emailMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Continue"}
                        </Button>
                      </div>
                      {emailError && (
                        <p className="text-xs text-destructive mt-2 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />{emailError}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

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
            ) : needsEmail ? (
              <>
                <Mail className="w-4 h-4 mr-2" />
                Enter email above to continue
              </>
            ) : (
              <>
                Run AI visibility audit
                {competitors.length > 0 && (
                  <span className="text-xs opacity-70 ml-2">
                    vs {tier === "snapshot" ? Math.min(competitors.length, 3) : competitors.length} competitor{competitors.length !== 1 ? "s" : ""}
                  </span>
                )}
              </>
            )}
          </Button>

          {/* Errors */}
          {auditMutation.isError && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-4">
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
                      if (msg.includes("email_limit_reached")) {
                        return "You've used all your free audits. Upgrade to Monitor for unlimited access.";
                      }
                      const cleaned = msg.replace(/^\d{3}:\s*/, "");
                      return cleaned.length > 200 ? cleaned.slice(0, 200) + "..." : cleaned;
                    })()}
                  </p>
                </div>
              </div>
            </div>
          )}

          {detectAllMutation.isError && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Auto-detection failed</p>
                  <p className="text-xs mt-1 opacity-80">Fill in the fields manually and add competitors below.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
